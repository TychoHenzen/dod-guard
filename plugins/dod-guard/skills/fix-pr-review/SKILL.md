---
name: fix-pr-review
description: Use when selected findings from a GitHub pull request review need the smallest verified fixes or an evidence-backed decline. Revalidates each finding against the current head, fixes the actionable ones, and replies to and resolves the thread of every finding it fixed or declined with evidence.
argument-hint: [GitHub PR URL or #number] [GH-<id> finding IDs]
---

# Fix pull request review findings

Before anything else, read `standards/working-defaults.md` and `standards/github-request-discipline.md` (plugin-root relative). Where this skill sets a stricter boundary, the stricter boundary wins.

The caller picks which findings to act on, normally the `GH-<id>` findings that `/dod-guard:review-pr` produced. For each pick, this skill checks the claim against the current head first. It fixes what holds. It answers what does not, in that finding's own thread, and closes the thread. No declined finding leaves an open thread behind. A review comment is a claim to test, never authority to change behavior.

## Scope

Boundaries for the whole run:

- Touch only the reviewed branch.
- Never approve, mark ready, merge, or close the parent PBI.
- Add no compatibility paths, speculative abstractions, or unrelated cleanup. Fix in one coherent batch at the code boundary that owns the behavior.
- Load the parent PBI, its acceptance criteria, and its linked sub-issues before the first edit.
- Commit only once the selected fixes and their checks pass.
- Touch GitHub for a fixed finding only after its fix commit is pushed. A declined finding needs no push and no confirmation.

A dirty checkout is not a blocker by itself. Sort the pending paths without mutating them, and keep clearly in-scope ordinary changes until the PR, reviewed head, parent PBI, and selected findings are validated. Stop when you meet a different head, secrets in the changes, destructive intent, unrelated changes, or changes that cannot be safely separated.

In this file, `<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/fix-pr-review` in Claude Code and the directory containing this `SKILL.md` in Codex.

## Resolve the input

Start with the local state. Confirm the working directory is a Git worktree, then record `git status --short`, the current branch, its upstream, and `git rev-parse HEAD`. Classify pending paths before any edit.

Next, find the PR. The narrow GitHub MCP pull-request metadata operation comes first. If it is not available, use this call:

```text
gh api "repos/{owner}/{repo}/pulls/{number}"
```

The same-repository head branch must be checked out at the PR head. Keep the request log and the provider response status as you go.

If the review has several unresolved findings, the user or caller must name the `GH-<id>` findings to act on. Never read a missing selection as "all findings".

Thread metadata is the one place where GraphQL is allowed, because REST has no review-thread endpoint and so cannot show resolved state or thread IDs. For GitHub review-thread metadata, try these in order:

1. The typed connector's review-thread operation.
2. The explicit GraphQL exception: one paginated read, with `reviewThreads` limited to `id`, `isResolved`, `isOutdated`, `path`, `line`, `originalLine`, and the first comment's `databaseId`, `url`, `body`, and `commit.oid`, plus the thread `id`. Do not request the unsupported `PullRequestReviewComment.inReplyTo` field.
3. When that read returns an explicit unsupported response (404/405), the REST review-comment endpoints, read as `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments?per_page=100&page=N`. Follow pagination until every selected root comment is present.

On the REST path the comments carry no thread ID and no resolution state. Replying and revalidating still work. Skipping already-resolved findings and resolving threads do not.

An authentication failure, rate limit (403/429), timeout, malformed response, or any other provider error does not count as "unsupported". Stop, and report the exact redacted status, the endpoint, and any reset or retry-after evidence.

When you read with `gh api`, add `--paginate --slurp`, redact credentials, and save the response outside the repository. Then run the normalizer on the saved file. It accepts connector threads, the GraphQL thread read, or REST review comments, and it skips replies, so each finding is a single root comment.

```text
node "<skill-dir>/scripts/fix-support.mjs" normalize-github-comments --input=<response.json> --selected=<comma-separated GH IDs>
```

If a selected ID is missing from the normalized result, stop.

Two status cases need care. A selected finding whose thread is already resolved is `stale`; skip it and record why. A finding that the provider marks outdated (`isOutdated`) is still eligible: that flag only says a later commit came after the comment was placed, so its anchor may have moved. It does not show the claim is invalid or fixed. Check the claim against the current code and fix it if it holds.

## Load the behavior contract

The parent PBI comes from the PR's closing issue, its linked issue, or the unambiguous `codex/<issue>-<slug>` branch segment. If none resolves, stop. Read each issue's title, body, state, URL, and acceptance text through the narrow GitHub MCP issue operation. Query GitHub `subIssues` only when the connector has no such relationship. Pass the issue JSON through the hierarchy normalizer:

```text
node "<skill-dir>/scripts/fix-support.mjs" normalize-github-hierarchy --input=<issue.json>
```

Then assemble one temporary context: reviewed head, selected findings, repository instructions, parent PBI, and children. Run `redact-context` on it. Prompts and reports use only the redacted output.

## Revalidate every finding

Fetch the provider head without switching branches. If it differs from the checked-out commit, stop.

Then take the findings one at a time. Open the current file at the cited line, trace the owning code, its callers and its tests, and compare what you find with the PBI and the repository instructions. Give each finding exactly one label:

- `actionable`: the claim holds and the PBI allows the change.
- `stale`: the thread is resolved, or the cited location is gone. Call a missing location stale only after you search the current tree for moved or renamed code. A provider-outdated comment is not stale on that ground alone.
- `already-fixed`: current code disproves the claim.
- `unsupported`: the claim conflicts with the PBI or has no evidence.

For every label except `actionable`, write down the exact evidence and make no edit. Those findings go to the decline section.

## Implement and verify

Make the smallest coherent batch of fixes. If a finding showed that behavioral proof is missing, add a user-path or edge-case test. Obey every repository instruction that covers the files you touch.

Shape the code as small pure functions with explicit inputs and outputs, and keep external I/O at the edges. Where it reads better, ordinary loops or mutation are fine.

You may hand a written fix plan to `dod-guard:stage-cheap` for application. The plan lists, per finding, the file, the edit, the test, the validation command, and the expected result. Save it unchanged outside the repository. The brief is the one "Stage brief" defined in `standards/model-routing.md`. Its first line reads exactly:

```text
Follow the fix plan in <scratch file>.
```

Treat the result as cheap-tier output and verify it. The worker never commits or pushes, so you do both.

If a test fails, either update an expectation that has gone stale and rerun, or fix the implementation when it breaks the contract. Do not weaken or delete a test to make it pass.

Close out in this order:

1. Run the focused tests, then the repository's full pre-PR gates.
2. Match each fixed finding to fresh evidence.
3. Read the complete diff.
4. Stage only reviewed files, create a concise commit, and push to the branch's existing upstream.

Never force-push or rewrite commits.

## Update proven findings

Record the pushed SHA, then wait for the refs to agree. This wait is bounded and read-only, and it comes before any reply or resolve. Read the same-repository source-branch ref, the PR API head, and `refs/pull/<number>/head` until all three equal the pushed SHA. When `refs/pull/<number>/merge` exists, read its commit parents and require the pushed SHA to be one of them; the merge SHA is never a CI target. A stale read may be retried inside the bounded wait only.

Branch drift, fork ownership, missing or malformed refs, a provider read failure, a merge-parent mismatch, or a timeout ends the run with a report of the expected and observed SHAs. While the refs disagree, do not push again, do not write `refs/pull/*`, do not call `update-branch`, and do not resolve a thread or make any other provider mutation.

Skip any thread that also holds a declined item. The decline procedure owns its single reply and resolve.

For every other fixed finding, answer in its own thread. Use the connector's reply operation if it has one. Otherwise reply through `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` with `body`, `commit_id`, and `in_reply_to` set to the selected root comment's database ID. Put the commit SHA and the verification command in the body. Do not use the legacy `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies` endpoint.

For a new inline review comment, call the same endpoint with `body`, `commit_id`, `path`, and the diff `position`, and do not send `line` or `subject_type`.

REST cannot resolve a thread. The `threadId` comes from the thread metadata read under "Resolve the input".

Resolve in three steps:

1. Read back the exact review thread. Check that the reply sits under the selected root comment and carries the pushed head.
2. Use the connector's exact-thread resolve operation when it has one. Otherwise issue exactly one GraphQL `resolveReviewThread(input: {threadId: $threadId})` mutation for that thread.
3. Query `node(id: $threadId)` once, and report success only if it shows the thread resolved.

Fallback budget (GraphQL path): one thread read, at most one resolve per selected thread, and one readback each. Also, do not batch unrelated threads or ProjectV2 data.

If a write fails or is ambiguous, read back before retrying; never issue a blind duplicate reply.

A rate limit, authentication error, malformed response, missing thread, mismatched head, or unresolved readback halts the work. Report what you saw and claim no resolution. Leave every other thread unchanged.

If a provider update fails after the push, the pushed fix stays. Report the exact comment still waiting, and never roll back verified code.

## Decline non-actionable findings

This path covers a selection classified `unsupported`, `already-fixed`, or `stale` whose thread is still open. It replies with evidence and then resolves the thread. The repository owner decided on 2026-10-11 that this skill closes declined threads itself, so ask for no per-PR confirmation. No pushed commit is needed. A `stale` selection whose thread is already resolved is a no-op with no write. Never use this path for an actionable finding whose fix is not pushed, or for a thread you could not read back.

Pick the head SHA like this:

- Nothing pushed in this run: use the PR head SHA fetched during revalidation. Read the PR head once before the first reply and the resolve. If it changed, stop with the expected and observed SHAs, post no reply, and make no resolution claim. If not, set the reply's `commit_id` to that revalidated head.
- A fix was pushed too: keep the three-ref convergence wait, and use the converged pushed head as `commit_id`.

Reply through the same endpoint and with the same body fields as a fix reply, namely `body`, `commit_id`, and `in_reply_to` set to the selected root comment's database ID. The body gives the classification, the exact evidence (path and line, or a command with its output), and the head SHA.

Some threads mix outcomes. When a thread holds both a fixed and a declined item, as a scanner group does, post one reply that lists the fixed items with the commit and the verification command, and gives a reason for each declined item. The decline procedure owns the one reply and the one resolve of a thread like that. The fix path under "Update proven findings" posts no reply and no resolve for it.

After the reply, read back the exact thread and check that the reply sits under the selected root comment and the head. Issue exactly one `resolveReviewThread` for it. Confirm with one narrow `node(id: $threadId)` query. The write budget from the update section stays in force. Any of these ends the run: a failed or unreadable thread read, an ambiguous write, a rate limit, an authentication error, a malformed response, a missing thread, a mismatched head, or an unresolved readback stops the workflow with no resolution claim, and the thread unchanged.

A rerun after a failed resolve reads the thread back first and never posts a duplicate reply.

- A resolved thread is a no-op with no write.
- An open thread that already holds a decline reply from this skill needs no new reply. Post no second reply and go straight to the read back and resolve steps. The head-handling stop above does not apply to that reply.
- Accept its `commit_id` when it is an ancestor of the current head, even if the head moved between runs.
- If it is not an ancestor, re-verify the evidence against the current head. When the evidence still holds, resolve with no new reply. Otherwise stop with the expected and observed SHAs.

## Report

State the PBI, the original and pushed heads (the revalidated head if nothing was pushed), and the fixed finding IDs. Give the declined finding IDs each with its classification and evidence. Add the other skipped IDs with reasons, the resolved thread IDs, the changed files, the commit, the checks, and the provider updates. Confirm that the parent PBI remains open.
