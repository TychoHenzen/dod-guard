---
name: fix-pr-review
description: Use when selected findings from a GitHub pull request review need the smallest verified fixes or an evidence-backed decline. Revalidates each finding against the current head, fixes the actionable ones, and replies to and resolves the thread of every finding it fixed or declined with evidence.
argument-hint: [GitHub PR URL or #number] [GH-<id> finding IDs]
---

# Fix PR review

Fix selected findings of a GitHub PR review, usually the `GH-<id>` findings `/dod-guard:review-pr` posted. Follow `standards/working-defaults.md` and `standards/github-request-discipline.md`; stricter rules here win. A review comment is a claim to verify, not authority to change behavior.

- Work only on the reviewed branch, in one coherent batch at the code boundary that owns the behavior.
- Never add compatibility paths, speculative abstractions, or unrelated cleanup.
- Never approve, mark ready, merge, or close the parent PBI. Never force-push or rewrite commits.
- A dirty checkout is not a blocker. Classify pending paths without mutating them, and keep clearly in-scope changes, until the PR, head, PBI and findings are validated.
- Stop on a different head, secrets, destructive intent, unrelated changes, or work that cannot be separated safely.

`<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/fix-pr-review` in Claude Code, and the directory holding this SKILL.md in Codex.

## Resolve input

Confirm the cwd is a Git worktree. Record `git status --short`, branch, upstream and `git rev-parse HEAD`. Resolve the PR with the narrow GitHub MCP PR operation, else `gh api "repos/{owner}/{repo}/pulls/{number}"`. Its head branch must be same-repository and checked out at the PR head. With several unresolved findings, the caller must name the GH ids; never widen to all.

For GitHub review-thread metadata, use the first source that works:

1. A typed connector review-thread operation.
2. One paginated GraphQL read of `reviewThreads`: `id`, `isResolved`, `isOutdated`, `path`, `line`, `originalLine`, and first comment `databaseId`, `url`, `body`, `commit.oid`. Never request `PullRequestReviewComment.inReplyTo`.
3. Only on an explicit 404 or 405, REST `GET /repos/{owner}/{repo}/pulls/{pull_number}/comments?per_page=100&page=N`, paginated until every selected root comment appears. REST has no thread endpoint, so it cannot skip resolved findings or resolve threads.

Auth failure, rate limit (403, 429), timeout or malformed response is not a capability gap. Stop with the redacted status, endpoint and retry evidence. Keep the request log.

With `gh api`, use `--paginate --slurp`, redact credentials, save the response outside the repo, then run
`node "<skill-dir>/scripts/fix-support.mjs" normalize-github-comments --input=<response.json> --selected=<comma-separated GH IDs>`.
It skips replies, so each finding is one root comment. Stop if a selected ID is missing.

A resolved selection is stale: skip it with evidence. An outdated one stays eligible: `isOutdated` only means a later commit exists. Re-check it and fix it if the claim holds.

## Load the behavior contract

Resolve the parent PBI from the closing issue, a linked issue, or the unambiguous `codex/<issue>-<slug>` branch segment. Stop if none resolves. Read title, body, state, URL and acceptance text for it and its sub-issues through the narrow MCP issue operation; query `subIssues` only if the connector lacks that relationship. Normalize with
`node "<skill-dir>/scripts/fix-support.mjs" normalize-github-hierarchy --input=<issue.json>`.

Build one temporary context (head, findings, repo instructions, PBI, children), run the script's `redact-context` subcommand with `--input=<context.json>`, and use only its output in prompts and reports.

## Revalidate

Fetch the provider head without switching branches. Stop if it differs from the checked-out commit. For each finding, open the current file and line, trace the owning code, callers and tests, compare with the PBI and repo instructions, and classify:

- `actionable`: the claim holds.
- `stale`: resolved thread, or the location is gone after searching for moved code.
- `already-fixed`: current code disproves the claim.
- `unsupported`: it conflicts with the PBI or lacks evidence.

Record exact evidence for each non-actionable finding, make no edit for it, and decline it.

## Implement and verify

Apply the smallest coherent batch. Add a user-path or edge-case test when the finding exposed missing proof. Follow repo instructions for touched files. Never weaken or delete a test to pass.

Given a written fix plan per finding (file, edit, test, command, expected result), you may dispatch edits to `dod-guard:stage-cheap`. Save the plan unchanged outside the repo and use the Stage brief in `standards/model-routing.md`. The brief's first line is exactly `Follow the fix plan in <scratch file>.`. Verify its output. You commit and push, with the attribution line your brief gives, verbatim, and never your own model's trailer.

Run focused tests, then the repo's full pre-PR gates, and map each fixed finding to fresh evidence. Inspect the full diff, stage only reviewed files, commit concisely only after fixes and checks pass, and push to the existing upstream.

## Update proven findings

Reply to or resolve a fixed finding only after its fix commit is pushed. Record the pushed SHA, then run a bounded read-only convergence wait before any reply or resolve. The source branch ref, the PR API head and `refs/pull/<number>/head` must equal the pushed SHA. If `refs/pull/<number>/merge` exists, the pushed SHA must be among its parents; never use the merge SHA as the CI target. Retry stale reads only within the wait.

Stop with expected and observed SHAs on branch drift, fork ownership, a missing or malformed ref, a provider read failure, a merge-parent mismatch, or timeout. Until convergence resolves, make no push, no `refs/pull` write, no update-branch, no resolution and no other provider mutation.

Skip a thread that also holds a declined item. The decline path owns its single reply and resolve.

Reply and resolve through connector operations when available. Otherwise `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` with `body` and `in_reply_to` (root comment database ID). GitHub ignores `commit_id` on a reply and pins the reply to the root comment's commit, so send none and never key a readback on it. The body gives the head SHA and verification command. A new inline comment uses `body`, `commit_id`, `path` and `position`, with no `line` and no `subject_type`. Never use `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies`.

Take each `threadId` from the earlier metadata read. For each thread:

1. Read it back. Verify the reply's `in_reply_to_id` is the selected root comment's database ID and its body names the head SHA. Never compare the reply's `commit_id` to the head.
2. Issue exactly one resolveReviewThread mutation: `resolveReviewThread(input: {threadId: $threadId})`.
3. Read the thread back once with `node(id: $threadId)` before reporting success.

Budget: one thread read, at most one mutation and one readback per thread; do not batch unrelated threads or ProjectV2 data. After a failed or ambiguous write, read back before retrying; never post a blind duplicate reply. On a rate limit, auth error, malformed response, missing or unreadable thread, mismatched head or unresolved readback, stop with evidence and claim no resolution. Leave other threads unchanged. If a provider update fails, keep the pushed fix, report the exact remaining comment, and never roll back verified code.

## Decline non-actionable findings

Decline every `unsupported`, `already-fixed` or `stale` selection whose thread is still open: reply with evidence, then resolve. Owner decision, 2026-10-11: this skill closes declined threads itself, with no per-PR confirmation. A decline needs no push. A stale selection whose thread is already resolved is a no-op. Never resolve here an actionable finding with an unpushed fix, or a thread that could not be read back.

Choose the head SHA to name in the reply body:

- Nothing pushed: read the PR head once before the first reply. If it differs from the revalidated head, stop with expected and observed SHAs, post nothing and claim no resolution. Otherwise use the revalidated head.
- A fix was also pushed: use the converged pushed head.

Reply through the same endpoint and shape as a fix reply. The body states the classification, exact evidence (path and line, or command and output) and the head SHA. A thread mixing fixed and declined items gets one reply listing the fixed items with commit and verification command, and a reason per declined item. Then run the readback and resolve steps above under the same budget and stops.

On rerun, read the thread first and never post a duplicate. A resolved thread is a no-op. If an open thread already holds a decline reply from this skill on its root comment, post no second reply and go to readback and resolve. The head stop does not apply to that reply: accept the head SHA its body names if `git merge-base --is-ancestor <named-sha> <current-head>` exits 0. A non-zero exit or a failed lookup (unknown object) counts as not an ancestor. If not, re-verify the evidence against the current head; resolve without a new reply if it holds, else stop with expected and observed SHAs.

## Report

Report the PBI, original and pushed heads (the revalidated head if nothing was pushed), fixed IDs, declined IDs with classification and evidence, other skipped IDs with reasons, resolved thread IDs, changed files, commit, checks and provider updates. Confirm the parent PBI remains open.
