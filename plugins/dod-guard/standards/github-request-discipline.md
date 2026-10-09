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

- An explicit MCP rate-limit result (`transport: mcp`, `category: mcp_rate_limit`;
  generic `rate_limit` input is normalized to this transport-specific category)
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
  evidence unless the operation is a documented capability-only GraphQL
  exception: draft-to-ready (`markPullRequestReadyForReview`, because REST has
  no supported draft field) or a selected review-thread operation. Draft-to-ready
  must verify `isDraft: false`; selected review-thread operations require an
  explicit REST/connector 404/405 and selected-thread readback. REST exposes no
  review-thread IDs, so without a connector thread operation one field-limited,
  paginated `reviewThreads` read may map selected comments to their threads,
  as `fix-pr-review` defines. complete-pr's unresolved-review-thread check is a
  third exception: one field-limited, cursor-paginated, read-only
  `reviewThreads` read of the pull request, because REST exposes no thread
  resolution state. It runs before any ready, auto-merge, CI dispatch, or merge
  mutation and again before each merge request, and it stops with
  `review-threads-unavailable` on a failed, malformed, or incompletely paginated
  read. All three exceptions preserve redacted transport evidence, stop on
  failure or ambiguity, and never serve as quota fallbacks.

The executable boundary is `<plugin-root>/lib/transport-policy.mjs`: call the
primary once, provide one named REST handler only for a supported operation, and
let `TransportStopError` carry the redacted stop evidence. The REST equivalents
used by the affected workflows are repository metadata (`GET /repos/{repository}`),
issue (`GET/PATCH /repos/{repository}/issues/{issueNumber}`), pull request
(`GET /repos/{repository}/pulls/{pullNumber}`), review comments, Project and
Project-item endpoints, branch refs, checks/workflow runs, labels, contents, and
branch protection. Writes still use the read-before-write and readback rules
below.

For a mutation, an explicit MCP/connector result such as an interactive form or
`awaiting_user_submission` is a no-op until a readback proves that the exact
resource did not change. Only then may the same request go through its one
authenticated REST handler, followed by one exact readback proving the desired
state. This fallback is allowed once for the issue, Project/status, or pull
request mutation path; authentication, permission, malformed, timeout,
provider, and REST-rate-limit failures remain fail-closed. A missing or
contradictory no-op readback never selects REST.

## Resolve the repository and Project

Every GitHub-facing skill resolves these values once, keeps them in the run
snapshot, and never reuses a repository, Project, field, option, or user id
from an earlier run.

1. Repository: use the GitHub MCP repository metadata operation. If MCP is
   unavailable, run `gh repo view --json nameWithOwner,defaultBranchRef,url`.
   Use `nameWithOwner` as the identity; do not parse the `origin` URL. Stop if
   there is no GitHub remote or no default branch.
2. Access: verify the connected identity can read and write the repository and
   its Project. Without MCP, run `gh auth status` and require the `repo` and
   `project` scopes. Stop if access is missing.
3. Project: read the repository's linked Projects once through the typed
   connector or the REST ProjectsV2 endpoints and keep only open ones. Exactly
   one must remain. With none, stop and explain that an administrator must link
   a Project to the repository. With more than one, stop and list each owner,
   number, and title; never pick one by name. This explicit link is the only
   supported repository-to-Project mapping, for personal and organization
   Projects alike.
4. Status: find exactly one `Status` field and, case-insensitively, exactly one
   option for each status the skill needs. Stop if any is absent or ambiguous.

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
only for a capability with no connector or REST equivalent, limited to the
documented exceptions: draft-to-ready via
`markPullRequestReadyForReview` when REST has no supported draft field, and
selected review-thread operations after connector/REST review-comment
operations have been attempted and the selected thread has been read back. Do
not use either exception for rate limits or other transport stops, and do not
use `gh pr view --json` for repeated metadata reads when the REST endpoint
provides the required fields.
