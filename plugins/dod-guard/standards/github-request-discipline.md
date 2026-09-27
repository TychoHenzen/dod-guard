# GitHub request discipline

All GitHub-facing skills use this policy. The connected GitHub MCP connector is
the preferred transport when it is available. Otherwise use `gh api` with the
same request shape.

MCP does not create a new GitHub quota. It reduces waste only when the skill
uses narrow operations, reuses a run snapshot, and avoids duplicate calls.

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
5. For Project v2, use one snapshot query for the linked Project, its fields and
   options, and the item data required by the current stage. Reuse every id.
   The current connector has no typed Project v2 operation, so GraphQL is the
   fallback for this boundary.

## ProjectV2 status writes

- A numeric Project number is valid for list and view commands, but it is not a
  GraphQL ProjectV2 node ID. Before any `gh project item-edit` mutation, resolve
  the number with `gh project view <number> --owner <owner> --format json` and
  use its top-level `id` value, which must begin with `PVT_`, as `--project-id`.
- Use the global item and Status-field node IDs from the same live Project
  snapshot, and use the scalar single-select option ID for the requested value.
- Run status mutations sequentially. For a structured parent, write every child
  before the parent, then read each item from `gh project item-list` before the
  next mutation. A missing or unexpected readback stops the sequence.
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
for Project v2 and relationships that have no REST endpoint. Do not use
`gh pr view --json` for repeated metadata reads when the REST endpoint provides
the required fields.
