# GitHub request discipline

All GitHub-facing skills use this policy. The connected GitHub MCP connector is
the preferred transport when it is available. Otherwise use `gh api` with the
same request shape.

MCP does not create a new GitHub quota. It reduces waste only when the skill
uses narrow operations, reuses a run snapshot, and avoids duplicate calls.

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
- Perform one mutation per actual state change. Reuse ids from the snapshot.
- For every `add_project_item` operation, set `item_type` explicitly:
  `issue` for issue items and `pull_request` for pull requests. If the
  operation returns `missing required parameter: item_type`, read back the
  Project before retrying once with the matching type. Do not retry if the item
  already exists.
- Re-read only the mutated resource for safety. Do not rebuild the whole
  repository, issue, or Project hierarchy after every write.
- Keep GitHub writes sequential. Bound read concurrency.
- After a failed, timed-out, or ambiguous write, read back that resource before
  retrying or issuing another mutation. Resume only from the observed state;
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
