---
name: fix-pr-review
description: Use when selected findings from a GitHub pull request review need the smallest verified fixes or an evidence-backed decline. Revalidates each finding against the current head, fixes the actionable ones, and replies to and resolves the thread of every finding it fixed or declined with evidence.
argument-hint: [GitHub PR URL or #number] [GH-<id> finding IDs]
---

# Fix pull request review findings

Fix selected findings from a GitHub pull request review, usually the `GH-<id>`
findings that `/dod-guard:review-pr` posted. Revalidate
each finding against the current head before editing. Fix the actionable ones.
Decline the rest with evidence in the finding's own thread, then resolve that
thread, so no declined finding leaves an open thread behind.

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
- Reply to a fixed finding or resolve its thread only after its fix commit is
  pushed. Reply to and resolve a declined finding under "Decline
  non-actionable findings"; that path needs no push and no confirmation.

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
edit for it; decline it under "Decline non-actionable findings".

## Implement and verify

Apply the smallest coherent fix batch. Add a user-path or edge-case test when
the finding exposed missing behavioral proof. Follow every repository
instruction that applies to touched files. When you have written a per-finding
fix plan (file, edit, test, validation command, expected result), you may
dispatch applying it to `dod-guard:stage-cheap` on the cheap tier. The brief is
the one "Stage brief" in `standards/model-routing.md` defines: its first line
reads `Follow the fix plan in <scratch file>.`, and the file holds the plan,
saved unchanged outside the repository. Verify that output as cheap-tier output, then commit and push
yourself.

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

Skip any thread that also holds a declined item, because "Decline
non-actionable findings" owns its single reply and resolve.

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

## Decline non-actionable findings

Decline every selection classified `unsupported`, `already-fixed`, or `stale`
whose thread is still open. Reply to it with evidence, then resolve its thread.
The repository owner decided on 2026-10-11 that this skill closes the thread of
every declined finding itself, so ask for no per-PR confirmation. A decline
needs no pushed commit. A `stale` selection whose thread is already resolved is
a no-op with no write. Never resolve by this path an `actionable` finding whose
fix is not pushed, or any thread that could not be read back.

Head handling:

- A run that pushed nothing revalidated the findings against the PR head SHA
  it fetched under "Revalidate every finding". Read the PR head once before
  the first reply and the resolve. When it differs, stop with the expected and
  observed SHAs, post no reply, and make no resolution claim. Otherwise set the
  reply's `commit_id` to that revalidated head.
- A run that also pushed a fix keeps the three-ref convergence wait under
  "Update proven findings" and uses the converged pushed head as `commit_id`.

Reply through the same endpoint and request shape as a fix reply, with `body`,
`commit_id`, and `in_reply_to` set to the selected root comment's database ID.
The body states the classification, the exact evidence (path and line, or the
command and its output), and the head SHA. A thread that mixes fixed and
declined items (a scanner group) gets one reply that lists the fixed items with
the commit and the verification command and gives a reason for each declined
item. This procedure owns the one reply and the one resolve of a thread that
holds both a fixed and a declined item. The fix path under "Update proven
findings" posts no reply and no resolve for such a thread.

Then read back the exact review thread, verify the reply belongs to the
selected root comment and the head, issue exactly one `resolveReviewThread`
mutation for that thread, and read the same thread back with one narrow
`node(id: $threadId)` query. The write budget and stops under "Update proven
findings" apply unchanged. A failed or unreadable thread read, an ambiguous
write, a rate limit, an authentication error, a malformed response, a missing
thread, a mismatched head, or an unresolved readback stops the workflow with
actionable evidence, no resolution claim, and the thread unchanged.

A rerun after a failed resolve reads the thread back first and never posts a
duplicate reply:

- A resolved thread is a no-op with no write.
- An open thread whose selected root comment already holds a decline reply from
  this skill is the state a failed resolve leaves. Post no second reply and go
  straight to the read back and resolve steps. The head-handling stop above
  does not apply to that reply. Accept its `commit_id` when it is an ancestor
  of the current head, even if the head moved between runs. When it is not an
  ancestor, re-verify the evidence against the current head: resolve without a
  new reply when it still holds, otherwise stop with the expected and observed
  SHAs.

## Report

Report the PBI, original and pushed heads (the revalidated head when nothing was
pushed), fixed finding IDs, declined finding IDs each with its classification
and evidence, other skipped IDs with reasons, the resolved thread IDs, changed
files, commit, checks, and provider updates. Confirm the parent PBI remains
open.
