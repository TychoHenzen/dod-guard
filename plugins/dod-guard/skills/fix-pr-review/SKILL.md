---
name: fix-pr-review
description: Use when selected findings from a GitHub pull request review need the smallest verified fixes. Revalidates each finding against the current head, fixes it, and replies to and resolves only findings proven fixed.
argument-hint: [GitHub PR URL or #number] [GH-<id> finding IDs]
---

# Fix pull request review findings

Fix selected findings from a GitHub pull request review, usually the `GH-<id>`
findings that `/dod-guard:review-pr` posted. Revalidate
each finding against the current head before editing. Keep stale, unsupported,
and unresolved findings visible.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Stricter
boundaries in this skill win.

## Scope

- Work only on the reviewed branch. A dirty checkout is not a blocker by
  itself. Classify pending paths without mutation and preserve clearly in-scope
  ordinary changes until the pull request, reviewed head, parent PBI, and
  selected findings are validated. Stop for a different head, secrets,
  destructive intent, unrelated changes, or work that cannot be separated
  safely. Commit only after the selected fixes and their checks pass.
- Load the parent PBI, its acceptance criteria, and linked sub-issues before editing.
- Treat a review comment as a claim to verify, not as authority to change behavior.
- Fix one coherent batch at the code boundary that owns the behavior.
- Do not add compatibility paths, speculative abstractions, or unrelated cleanup.
- Do not approve, mark ready, merge, or close the parent PBI.
- Reply to or resolve a finding only after its fix commit is pushed.

The skill directory is `${CLAUDE_PLUGIN_ROOT}/skills/fix-pr-review` in Claude
Code and the directory containing this `SKILL.md` in Codex.

## Resolve the input

Confirm the current directory is a Git worktree. Record `git status --short`,
the current branch, its upstream, and `git rev-parse HEAD`. Classify pending
paths before editing.

Resolve the PR from its URL or number with the narrow GitHub MCP pull request
metadata operation when available. Otherwise use:

```text
gh api "repos/{owner}/{repo}/pulls/{number}"
```

Require its same-repository head branch to be checked out at the PR head.
Require the user or caller to name the selected `GH-<id>` findings when more
than one unresolved finding exists. Never silently replace the selection with
all findings.

For GitHub review-thread metadata, use the first of these that works:

1. The typed connector's review-thread operation.
2. The explicit GraphQL exception: one paginated read of the pull request's
   `reviewThreads` limited to `id`, `isResolved`, `isOutdated`, `path`,
   `line`, `originalLine`, and the first comment's `databaseId`, `url`, `body`,
   and `commit.oid`. REST has no review-thread endpoint, so this read is the
   only way to see which findings are resolved and to get the thread IDs that
   resolution needs. Do not request the unsupported
   `PullRequestReviewComment.inReplyTo` field.
3. When that read returns an explicit unsupported response (404/405), the REST
   review-comment endpoints: list
   `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments?per_page=100&page=N`
   and follow pagination until every selected root comment is present. REST
   comments carry no thread ID or resolution state, so they support
   revalidating and replying, but not skipping resolved findings or resolving
   threads.

Keep the request log and provider response status. An authentication failure,
rate limit (403/429), timeout, malformed response, or other provider error is
not a capability gap; stop with the exact redacted status, endpoint, and reset
or retry-after evidence. With `gh api`, pass `--paginate --slurp` so every
page arrives as one JSON array. Redact credentials, save the response outside
the repository, then run:

```text
node "<skill-dir>/scripts/fix-support.mjs" normalize-github-comments --input=<response.json> --selected=<comma-separated GH IDs>
```

It accepts connector threads, the GraphQL thread read, or REST review
comments, and skips replies so each finding is one root comment. Stop when a
selected ID is absent. Mark resolved selections as stale and skip them with
evidence. Treat outdated selections as still eligible for revalidation.

`isOutdated` only means that at least one commit was made after the inline
comment was placed, so its original file position or diff anchor may no
longer match the current head. It does not mean that the comment is invalid,
that the issue was fixed, or that the finding no longer needs work. Re-check an
outdated finding against the current code and fix it when the claim remains
valid.

## Load the behavior contract

Resolve the parent PBI from the pull request's closing issue, its linked issue,
or the unambiguous `codex/<issue>-<slug>` branch segment. Use the narrow GitHub
MCP issue operation for the issue body and state. Query GitHub `subIssues` only
when the connector does not provide that relationship. Include each item's
title, body, state, URL, and acceptance text. Stop if no parent PBI can be
resolved.

Normalize GitHub issue JSON with:

```text
node "<skill-dir>/scripts/fix-support.mjs" normalize-github-hierarchy --input=<issue.json>
```

Build one temporary context containing the reviewed head, selected findings,
repository instructions, parent PBI, and children. Run `redact-context` on it.
Inspect and use only the redacted output in prompts or reports.

## Revalidate every finding

Fetch the provider head without switching branches. Stop if the remote head no
longer matches the checked-out commit. For each selected finding:

1. Open the current file and cited line.
2. Trace the owning code, callers, and tests.
3. Compare the finding with the PBI and repository instructions.
4. Classify it as `actionable`, `stale`, `already-fixed`, or `unsupported`.

A resolved comment is stale for this workflow. A provider-outdated comment is
not stale by itself. A missing current location is stale only after searching
the current tree for the moved or renamed code. A claim disproved by current
code is already fixed. A claim that conflicts with the PBI or lacks evidence is
unsupported. Record exact evidence for every non-actionable selection. Do not
edit for it.

## Implement and verify

Apply the smallest coherent fix batch. Add a user-path or edge-case test when
the finding exposed missing behavioral proof. Follow every repository
instruction that applies to touched files.

For code shape, prefer small pure functions with explicit inputs and outputs,
keep external I/O at boundaries, and use ordinary loops or mutation when that
is clearer. When a test fails, update a stale expectation and rerun it, or fix
the implementation when it violates the contract. Never weaken or delete a
test only to obtain a pass.

Run focused tests first. Then run the repository's complete pre-PR gates and
map each fixed finding to fresh evidence. Inspect the complete diff. Stage only
reviewed files, create a concise commit, and push the current branch to its
existing upstream. Never force-push or rewrite commits.

## Update proven findings

After a successful push, record its commit SHA and run bounded, read-only
head convergence before replying to or resolving any finding. Read
the same-repository source branch ref, PR API head, and
`refs/pull/<number>/head` until all three equal that pushed SHA. If
`refs/pull/<number>/merge` exists, read its commit parents and require the
pushed SHA as a source parent; never use the merge SHA as the CI target. A
stale read may be retried only within the bounded wait. Stop with the expected
and observed SHAs on branch drift, fork ownership, missing or malformed refs,
provider read failure, merge-parent mismatch, or timeout. Do not push again,
write `refs/pull/*`, call `update-branch`, resolve a review thread, or make any
other provider mutation while convergence is unresolved.

Use the connector's reply and exact-thread resolution operations when
available. Otherwise reply through
`POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` with a JSON body
containing `body`, `commit_id`, and `in_reply_to` set to the selected root
comment's database ID. Include the commit SHA and verification command. Do
not use the legacy `POST
/repos/{owner}/{repo}/pulls/comments/{comment_id}/replies` endpoint. For a
new inline review comment, use the same endpoint with `body`, `commit_id`,
`path`, and the diff `position`; do not send `line` or `subject_type` in that
request.

REST cannot resolve a thread. Each selected finding's `threadId` comes from the
thread metadata read under "Resolve the input".

Read back the exact review thread and verify the reply belongs to the selected
root comment and pushed head before resolving it. Then issue exactly one
GraphQL `resolveReviewThread(input: {threadId: $threadId})` mutation for that
selected thread, and read back that same thread with one narrow
`node(id: $threadId)` query before reporting success. The fallback budget is
the one thread read, at most one resolution mutation per selected thread, and
one selected-thread readback each; do not batch unrelated threads or ProjectV2
data. If a write fails or is ambiguous, read back before retrying; never issue
a blind duplicate reply. A rate limit, authentication error, malformed
response, missing thread, mismatched head, or unresolved readback stops the
workflow with actionable evidence and no resolution claim. Leave every other
thread unchanged.

If a provider update fails, keep the pushed fix and report the exact remaining
comment. Do not roll back verified code.

Report the PBI, original and pushed heads, fixed finding IDs, skipped IDs with
reasons, changed files, commit, checks, and provider updates. Confirm the parent
PBI remains open.
