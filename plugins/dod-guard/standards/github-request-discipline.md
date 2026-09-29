# GitHub request discipline

All GitHub-facing skills use this policy. The connected GitHub MCP connector is
the preferred transport when it is available. Otherwise use `gh api` with the
same request shape.

MCP does not create a new GitHub quota. It reduces waste only when the skill
uses narrow operations, reuses a run snapshot, and avoids duplicate calls.

## Transport decision

Every GitHub operation has one primary connector/MCP attempt. A healthy result
stays on MCP; do not call REST in parallel or as a speculative duplicate. The
only alternate-transport decisions are:

- An explicit MCP rate-limit result (`transport: mcp`, `category: rate_limit`)
  or a supported MCP transport-unavailable result selects the same authenticated
  REST operation once. Pass the original repository, Project, issue, pull
  request, field, option, item, branch, and pagination identity unchanged.
- Record the redacted primary failure and named REST endpoint. Do not retry the
  exhausted MCP operation, add a routine GraphQL request, or infer a resource
  from a title or stale snapshot.
- Authentication, permission, malformed, timeout, unsupported, and provider
  failures stop. A REST rate limit also stops; it never selects GraphQL or a
  second REST mutation. A bare 401/403 is not a rate limit.
- If no equivalent REST operation exists, stop with the redacted primary
  evidence. The selected review-thread GraphQL exception remains capability-
  gated by an explicit REST/connector 404/405 and is never a quota fallback.

The executable boundary is `<plugin-root>/lib/transport-policy.mjs`: call the
primary once, provide one named REST handler only for a supported operation, and
let `TransportStopError` carry the redacted stop evidence. The REST equivalents
used by the affected workflows are repository metadata (`GET /repos/{repository}`),
issue (`GET/PATCH /repos/{repository}/issues/{issueNumber}`), pull request
(`GET /repos/{repository}/pulls/{pullNumber}`), review comments, Project and
Project-item endpoints, branch refs, checks/workflow runs, labels, contents, and
branch protection. Writes still use the read-before-write and readback rules
below.

## Read plan

1. Resolve the repository once. Retain its `nameWithOwner`, default branch,
   stable id, URL, and authenticated user in the run snapshot.
2. Build one snapshot for each workflow. Request only fields required by the
   current stage and reuse those values in later stages.
3. Prefer narrow connector operations: `github_get_repo` for repository
   metadata, `github_get_pr_info` for pull request metadata,
   `github_fetch_issue` for issue state and body, and
   `github_list_pull_request_review_threads` for review threads. Fetch a diff,
   patch, comments, or full pull request only when the current stage needs it.
4. Use one bounded search or list request for candidates. Do not repeat the
   same search with different field selections.
5. For Project v2, use one snapshot operation for the linked Project, its fields
   and options, and the item data required by the current stage. Prefer the
   typed connector; otherwise use the REST ProjectsV2 endpoints. Reuse every
   live id.

## ProjectV2 status writes

- A numeric Project number is the REST path identifier. Resolve the live
  Project, Status field, item ids, and scalar single-select option ids from the
  same REST snapshot before writing.
- Use the global item and Status-field ids from that snapshot, and use the
  scalar single-select option id for the requested value.
- Run status mutations sequentially. For a structured parent, write every child
  before the parent, then read each item from the REST Project items endpoint
  before the next mutation. A missing or unexpected readback stops the sequence.
- The shared `skills/complete-pr/scripts/project-status.mjs` runner performs
  this resolution and readback without invoking Git or inspecting worktrees.

## Write plan

- Prefer typed connector mutations. Otherwise use REST `gh api` for REST-capable
  writes.
- Read the target immediately before each write. If the desired state is already
  present, record the no-op and issue no mutation; otherwise issue exactly one
  mutation for that state change and preserve the live ids from the read.
- For create-like writes, read the exact resource or Project membership first.
  Create only when it is absent. If a create fails or is ambiguous, read back
  before any retry; an existing resource is success, an unresolved readback
  stops, and no duplicate create is allowed.
- For every `add_project_item` operation, set `item_type` explicitly:
  `issue` for issue items and `pull_request` for pull requests. If the
  operation returns `missing required parameter: item_type`, read back the
  Project before retrying once with the matching type. Do not retry if the item
  already exists.
- Re-read only the mutated resource for safety. Do not rebuild the whole
  repository, issue, or Project hierarchy after every write.
- Keep GitHub writes sequential. Bound read concurrency.
- After a failed, timed-out, or ambiguous write, read back that resource before
  retrying or issuing another mutation. A desired readback confirms success;
  an absent or different readback permits at most the one planned mutation and
  then stops if its result remains unresolved. Resume only from observed state;
  retry one identical transient provider failure at most once.
- On primary exhaustion, stop and report the reset time. On a secondary limit,
  honor `Retry-After` or the reset time, then use exponential backoff.
- Use pagination only when one page cannot satisfy the request. Request up to
  100 items per page and stop when the known target set is complete.

## CLI fallback

Scripts that cannot call MCP use narrow `gh api` REST endpoints. Keep GraphQL
only for a capability with no connector or REST equivalent. The remaining
documented exception is review-thread resolution after connector/REST review
comment operations have been attempted and the selected thread has been read
back. Do not use `gh pr view --json` for repeated metadata reads when the REST
endpoint provides the required fields.
