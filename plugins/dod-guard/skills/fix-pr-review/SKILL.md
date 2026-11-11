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
- A dirty checkout is not a blocker. Classify pending paths without mutating them, and keep in-scope changes, until the PR, head, PBI and findings are validated. A pending path is in scope only if it appears in `git diff --name-only origin/<base.ref>...HEAD` or is a test for such a path; anything else is unrelated, so stop. Take `base.ref` from the PR response that "Resolve input" reads, run `git fetch origin <base.ref>` first, and stop if the fetch fails.
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
- `partial`: the claim holds, but this batch fixes only a bounded part of it. Fix that part with the batch.
- `out-of-slice`: the claim holds, but the fix is outside the PBI's acceptance criteria and belongs to another open issue. Make no edit for it.

Record exact evidence for each non-actionable finding, make no edit for it, and decline it.

A `partial` or `out-of-slice` finding is not declined: it follows "Route a partial or out-of-slice finding".

## Implement and verify

Apply the smallest coherent batch. Add a user-path or edge-case test when the finding exposed missing proof. Follow repo instructions for touched files. Never weaken or delete a test to pass.

Given a written fix plan per finding (file, edit, test, command, expected result), you may dispatch edits to `dod-guard:stage-cheap`. Save the plan unchanged outside the repo and use the Stage brief in `standards/model-routing.md`. The brief's first line is exactly `Follow the fix plan in <scratch file>.`. Verify its output. You commit and push, with the attribution line your brief gives, verbatim, and never your own model's trailer.

Run focused tests, then the repo's full pre-PR gates, and map each fixed finding to fresh evidence. Inspect the full diff, stage only reviewed files, commit concisely only after fixes and checks pass, and push to the existing upstream, confirming the push as "Confirm every push" in `standards/working-defaults.md` says. When CI must run again on a head, rerun the existing run with `gh run rerun <run-id> --failed`; never dispatch a second workflow run for the same head.

If a finding's fix fails its focused test or a gate twice, the finding is `unfixed`: revert only your own edits for that finding, push nothing for it, leave its thread open with no reply, and never weaken, skip or delete the test. Before the first edit to a path that already has pending changes, copy the file outside the repo, and record its hash after your edit. Revert a clean path with `git checkout -- <path>` and delete a file you created. Restore a copied path only while its current hash still equals the recorded post-edit hash; if it differs, stop and report. A pending path edited with no copy taken cannot be restored safely: stop, report it, and change nothing more in it. Never stash, reset or check out a path that holds pending changes you did not make. A path that also holds the edit of a passed finding is not restored or checked out whole: undo only the unfixed finding's hunks, and if the two cannot be separated, list both findings as `unfixed` and revert both. If the failing command cannot be tied to one finding, revert this run's edits to the paths that command covers, leave every affected thread open, list each affected finding as `unfixed`, and stop. After any revert, rerun the focused tests and the full gates on the remaining batch, and commit and push only after they pass; a second failure there makes those findings `unfixed` too.

## Update proven findings

Reply to or resolve a fixed finding only after its fix commit is pushed. Record the pushed SHA, then run a read-only convergence wait before any reply or resolve: read the three refs named next up to 5 times, one Bash call per read, with no `sleep` of 30 seconds or more (a pause, if any, is one `sleep` of 20 seconds or less inside that read's call); if they still disagree after the fifth read, stop with the expected and observed SHAs. The source branch ref, the PR API head and `refs/pull/<number>/head` must equal the pushed SHA. If `refs/pull/<number>/merge` exists, the pushed SHA must be among its parents; never use the merge SHA as the CI target. Retry stale reads only within the wait.

Stop with expected and observed SHAs on branch drift, fork ownership, a missing or malformed ref, a provider read failure, a merge-parent mismatch, or the fifth read without a match. Until convergence resolves, make no push, no `refs/pull` write, no update-branch, no resolution and no other provider mutation.

For a structured parent, rerun post-push at the converged pushed head (`node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs post-push --body-file=<path> --handoff-file=<path> --head-sha=<sha> [--children=<path>]`). Every row of the handoff matrix needs re-observation at the new head, and the Acceptance matrix block is rewritten with all of them before this rerun (step 1 of "Rebind the handoff"). The carried `## Preflight checkpoint` rows stay bound to the previous head until step 3 of "Rebind the handoff", so after the matrix update the rerun may exit 1 with only lines of the form `required context <name> is bound to <old-sha>, expected <sha>`: those are expected here and do not block replies. Any other exit-1 line is a stale row: report it with the stale row ids, stop with the fixed threads open and the pushed SHA recorded, and resolve no thread until a rerun at the same head leaves only expected lines. Do not route this to `dod-guard:submit-draft-pr` Update mode: its step 1 reruns this proof and stops on the same exit 1. On exit 2 (a body or handoff that cannot be read or parsed), stop the same way and report the printed error. Make no edit of the parent issue body.

Skip a thread that also holds a declined, partial or out-of-slice item. The decline or routing path owns its single reply and resolve.

Reply and resolve through connector operations when available. Otherwise `POST /repos/{owner}/{repo}/pulls/{pull_number}/comments` with `body` and `in_reply_to` (root comment database ID). GitHub ignores `commit_id` on a reply and pins the reply to the root comment's commit, so send none and never key a readback on it. The body gives the head SHA and verification command. A new inline comment uses `body`, `commit_id`, `path` and `position`, with no `line` and no `subject_type`. Never use `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies`.

Take each `threadId` from the earlier metadata read. For each thread:

1. Read it back. Verify the reply's `in_reply_to_id` is the selected root comment's database ID and its body names the head SHA. Never compare the reply's `commit_id` to the head.
2. Issue exactly one resolveReviewThread mutation: `resolveReviewThread(input: {threadId: $threadId})`.
3. Read the thread back once with `node(id: $threadId)` before reporting success.

Budget: one thread read, at most one mutation and one readback per thread; do not batch unrelated threads or ProjectV2 data. After a failed or ambiguous write, read back before retrying; never post a blind duplicate reply. On a rate limit, auth error, malformed response, missing or unreadable thread, mismatched head or unresolved readback, stop with evidence and claim no resolution. Leave other threads unchanged. If a provider update fails, keep the pushed fix, report the exact remaining comment, and never roll back verified code.

## Decline non-actionable findings

Decline every `unsupported`, `already-fixed` or `stale` selection whose thread is still open: reply with evidence, then resolve. Owner decision, 2026-10-11: this skill closes declined threads itself, with no per-PR confirmation. A decline needs no push. A stale selection whose thread is already resolved is a no-op. Never resolve here an actionable finding with an unpushed fix, or a thread that could not be read back.

`dod-guard:complete-pr` reads only whether each review thread is resolved and stops with `unresolved-review-threads` on any open one. It never reads reply text. This reply-then-resolve path, and the routing path below, are how a finding that will not be fixed in this PR stops blocking that merge.

Choose the head SHA to name in the reply body:

- Nothing pushed: read the PR head once before the first reply. If it differs from the revalidated head, stop with expected and observed SHAs, post nothing and claim no resolution. Otherwise use the revalidated head.
- A fix was also pushed: use the converged pushed head.

Reply through the same endpoint and shape as a fix reply. The body states the classification, exact evidence (path and line, or command and output) and the head SHA. A thread mixing fixed and declined items gets one reply listing the fixed items with commit and verification command, and a reason per declined item. Then run the readback and resolve steps above under the same budget and stops.

On rerun, read the thread first and never post a duplicate. A resolved thread is a no-op. If an open thread already holds a decline reply from this skill on its root comment, post no second reply and go to readback and resolve. The head stop does not apply to that reply: accept the head SHA its body names if `git merge-base --is-ancestor <named-sha> <current-head>` exits 0. A non-zero exit or a failed lookup (unknown object) counts as not an ancestor. If not, re-verify the evidence against the current head; resolve without a new reply if it holds, else stop with expected and observed SHAs.

## Rebind the handoff

Apply this section only when a fix was pushed and the parent is structured. A run that pushed nothing leaves the handoff comment as it is. Step 1 is the handoff matrix update that "Update proven findings" requires before any thread is resolved. Steps 2 to 4 run after the fixed threads are replied to and resolved, so no thread waits on CI.

1. Save the current `## Implementation handoff` comment as the previous handoff (the newest by creation time when several comments by the authenticated user carry the heading; `skills/next-ticket/scripts/handoff-select.mjs` names it), read with `--jq .body` as `standards/github-request-discipline.md` says for an edited comment, and stop if its first line is not the heading. Build <evidence.json> from that comment: keep every task entry, replace every acceptance matrix row with its value observed at the pushed head (a row whose value is unchanged still takes the pushed head), and set `commit` to the pushed SHA for each task the fix touched. Rebuild the comment for the converged pushed head with `node <plugin-root>/skills/next-ticket/scripts/handoff-build.mjs --body-file=<issue-body.md> --evidence-file=<evidence.json> --head-sha=<sha> --previous-handoff-file=<previous.md>`. The option copies the previous `## Preflight checkpoint` section into the new comment, so the rebuilt comment never loses it. Exit 0 prints the rebuilt comment. Exit 1 prints the unmet evidence and exit 2 a usage error; stop on either, report the printed text, and leave the existing comment as it is. Update the one existing comment with `gh api --method PATCH repos/{owner}/{repo}/issues/comments/<comment-id> -F body=@<file>` and read it back with `--jq .body`. Never post a second handoff comment.
2. The carried rows are bound to the old head. Wait until every required context at the converged head has a terminal state with `gh pr checks <pull-request> --watch --required`: exit 0 and 1 are terminal, 8 is not.
3. Rewrite the checkpoint rows at the converged head as step 2 of "Update mode" in `skills/submit-draft-pr/SKILL.md` says, by steps 1, 2 and 4 of its "Early preflight checkpoint". Head convergence and the post-push proof already ran above and the draft body is not resubmitted here. Update the same comment as step 1 says and read it back.
4. Run `node <plugin-root>/skills/next-ticket/scripts/handoff-proof.mjs finalization --body-file=<path> --handoff-file=<path> --head-sha=<sha> [--children=<path>]`. The expected result is exit 0 with `{"outcome": "verified", "remainder": []}`, and the rebound comment keeps its `## Preflight checkpoint` with every row at the converged head. Any other result is a stop branch:
   - Exit 1 (`actionable remainder`, for example a failed or stale context row): report the printed remainder as the stage remainder and claim no verified handoff.
   - Exit 2 (a body or handoff that cannot be read or parsed): report the printed error and claim no verified handoff.
   - A checkpoint section missing from the rebuilt comment, or a `gh pr checks` timeout or non-terminal exit: stop, report it, and leave the comment as last read back.

   Do not resubmit the draft pull request.

## Route a partial or out-of-slice finding

A `partial` or `out-of-slice` finding leaves work this PR does not deliver. Its thread closes only after that remainder sits on another issue.

The destination is an existing open issue in this repository. It is not a pull request, not the parent PBI, and not any issue this PR closes through a closing keyword. The caller names it. Without a named one, collect every open sibling sub-issue of the parent and every open Backlog issue whose body covers the remainder. Exactly one match is the destination. Sibling and Backlog issues carry no precedence over each other: a sibling and a Backlog issue that both match, or two of either kind, are no unique match. Read the destination's state and type before the first write. A closed issue, a pull request, another repository, an issue this PR closes, or no unique match leaves the finding unrouted. This skill never creates an issue.

Do not route a thread that is already resolved. For each other thread, under the budget and stops of "Update proven findings":

1. For `partial`, push the fix commit and complete the convergence wait first. Reply nothing before that.
2. Look in the destination's comments for the marker line `<!-- fix-pr-review: GH-<id> -->`. If absent, post one comment that holds the marker, the finding id, the thread URL, path and line, the claim, what remains, and the head SHA. Read it back.
3. Look in the thread for a reply holding the same marker. If absent, reply to the root comment with the marker, the destination comment link and the head SHA. For `partial`, also list the fixed part with its commit and verification command, and the remainder. For `out-of-slice`, name the acceptance criteria it falls outside and say whether the caller or the hierarchy named the destination. Read the reply back by root and body.
4. Run the readback and resolve steps from "Update proven findings".

A rerun that finds the marker in either place skips that write and goes on to the next step. Never post a second comment or reply. The marker's `GH-<id>` is the review comment's own database ID, unique within the repository, and the destination is in this repository, so the marker needs no PR scope. The closed-destination check applies only before the first write: a destination that already holds the marker comment stays valid on rerun even if it closed since, because the remainder is recorded there. Then post only the missing thread reply, and read back and resolve.

Unrouted: push the fixed part of a `partial` finding, leave the thread open, post no destination comment, and report `unrouted: GH-<id>`. The caller then names an open destination and reruns this skill, or a person resolves the thread by hand. `dod-guard:complete-pr` stops with `unresolved-review-threads` until one of those happens. An unrouted finding is a finding with no landed fix, and the thread stays open for the same reason.

## Report

Report the PBI, original and pushed heads (the revalidated head if nothing was pushed), fixed IDs, declined IDs with classification and evidence, routed IDs with the destination issue link, `unrouted: GH-<id>` entries, `unfixed: GH-<id> <failing command>` for each reverted finding, other skipped IDs with reasons, resolved thread IDs, changed files, commit, checks, provider updates and the finalization result of the rebound handoff. Confirm the parent PBI remains open.

Regression checks use [the fix-pr-review fixtures](fixtures.md).
