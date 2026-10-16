---
name: complete-pr
description: Complete a verified open pull request through guarded REST merge, required checks, linked-issue confirmation, and remote branch deletion.
---

# Complete PR

Calling this skill is the explicit acceptance gate for the current pull request, so no further human approval follows it. The caller checked the head, linked child acceptance, review remediation, required checks, and cleanup conditions before calling. This skill still does the last guarded verification itself. Review comments, green checks, and earlier commands never stand in for that gate.

Load `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root. Stricter boundaries in this skill win over both. Shell composition follows the [command-composition contract](../../docs/command-composition.md): the helper invocation passes repository and PR number as separate native arguments and preserves a non-zero preflight result.

## Resolve the pull request

1. Check that the working directory is a Git checkout, then run `git status --short`.
2. Treat a dirty tree as input, not failure. Sort each pending path without changing it, and keep ordinary edits that clearly belong to the accepted PBI.
3. Stop on secrets, destructive intent, unrelated or indistinguishable work, or a PR that no longer represents reviewed code.
4. Run `gh auth status`. It must show `repo` access.
5. Get the repository and default branch from the GitHub MCP repository operation. Fall back to `gh repo view --json nameWithOwner,defaultBranchRef,url` only when MCP is unavailable.
6. Pick the single open PR for the current branch, or the number the user supplied. Draft and ready both qualify. The head lives in this repository and the base is the default branch.
7. Read the PR, its linked issue, the review result, and the newest verification evidence. Stop if the draft is not the reviewed, verified code.
8. If pending changes are clearly part of the accepted PBI, stage only those reviewed paths, commit them on this verified branch, push, and reread the head and evidence. Stop unless the new head carries fresh review and verification evidence for them.

## Complete the accepted pull request

### Gates before the helper

**Preflight checkpoint.** Take the `## Preflight checkpoint` from the implementation handoff. Before any ready transition, branch update, merge, or cleanup, it must give:

- the exact branch and PR head;
- the base ref and SHA, and mergeability;
- a matrix row for every required provider context, each with provider, workflow, run ID, ref, head SHA, and state. A classic status-only context may leave out workflow and run ID, but it still needs provider, the same repository ref, and exact head.

State values are `present`, `pending`, `failed`, `skipped`, and `unavailable`. An exact-head `skipped` context passes. Reject missing, pending, failed, unavailable, stale, duplicate, forked, or provider-mismatched evidence, and never infer success from a passing aggregate. On rejection, stop and report expected versus observed.

**Draft-skipped workflow.** When a workflow was skipped because the PR was a draft, confirm draft readiness at the same repository ref and exact head. Dispatch once through the existing guarded workflow owner, then read back run, workflow, ref, and head before waiting. If the base advances, the handoff and acceptance matrix are void. Bounded branch synchronization is the only recovery, and a merge conflict on the PBI head goes to the triage under "Triage a merge conflict". An unresolvable conflict, unexpected branch movement, failed readback, or a second dispatch stops before review resolution, merge, cleanup, force-push, or generated-ref mutation. After synchronizing, require fresh acceptance and required-check proof at the final head.

**Review threads.** Once the head has converged and before any mutation, read all review threads. Count each unresolved thread, whoever wrote it and even if outdated. Never count resolved ones.

- Any unresolved thread: stop with `unresolved-review-threads` and name each thread URL and path.
- A read that fails, is malformed, or is not fully paginated: stop with `review-threads-unavailable` before marking ready, enabling auto-merge, dispatching CI, or merging.
- To clear either stop, run `dod-guard:fix-pr-review` or resolve the thread, then rerun this skill.

### Run the helper

Find the skill directory from this loaded file and pass the exact verified pushed head. The helper does not treat a mutable provider head as its first sign of acceptance.

```text
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number> --pushed-head <verified-head-sha>
```

The helper works in this order.

CI and checks:

- It marks a draft ready and leaves an already-ready PR alone.
- It looks for a `.github/workflows/ci.yml` run on the accepted head. With none, it confirms the same-repository branch still points at that SHA, dispatches once, and waits a bounded time for an exact-head run. After an ambiguous dispatch it reads back and does not retry blindly.
- It waits out queued or in-progress CI. It stops on a fork, branch drift, a stale or duplicate run, the wrong workflow, a failed or cancelled run, an unsupported state, a dispatch error, or a missing-run timeout.
- One REST path, shared with the closure snapshot, supplies the required checks: base branch protection, then the check runs and commit statuses of the exact PR head, including an expected GitHub App provider. It never runs `gh pr checks`, and the token must be able to read branch protection.
- A 403 or other non-404 protection read, or a failed check or status read, stops with an error that names the endpoint. A 404 (unprotected base) stops with `missing_required_checks`. A green `ci.yml` run alone is not acceptance.
- When one provider reports several exact-head runs of a required check, the newest numeric check-run id decides. Runs that cannot be ordered count only if they agree. `success`, `neutral`, and `skipped` pass; pending stays pending. Missing, stale, mismatched, conflicting, disagreeing unordered, or unsupported evidence fails closed, as do several statuses, or a run plus a status, for one context.

Branch and merge:

- It updates a stale branch only with its trusted head SHA. An update commit is accepted only when its parents are the prior trusted head and the base tip read just before the update. An absent base ref gives `base_branch_missing`. If the base moves again, it repeats the guarded update.
- stops with `merge_conflict` on conflicts, which the triage below handles, and on unexpected pushes, permission failures, and bounded waits.
- It enables repo auto-merge when needed and waits for every required check, stopping on failure or cancellation. Right before each merge request it rereads review threads and stops the same way.
- It merges through the REST pull-request endpoint with the expected head SHA, then confirms the merge commit and the linked closing issue state.

Cleanup:

- It checks that the same-repository remote branch still points at the merged head, deletes it, and confirms it is gone.
- It cleans the local branch only through the current checkout: switch to the default branch only when clean and fast-forwardable, keep any dirty or refused state, and never touch another checkout.

Never use `--admin`, force-push, weaken repository protections, or delete a ref whose SHA differs from the merged PR head.

### Recover a merged pull request

If an earlier run merged but stopped before cleanup, check live state first. Then run the dry run, and after it the real recovery:

```text
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number> --recover-merged --dry-run
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number> --recover-merged
```

Recovery takes only a PR that is already merged, with complete required checks, closed linked issues, and `Done` Project status. It deletes the remote head only if that head still equals the merged head, confirms it is gone, performs the same exact-branch local cleanup, and reports whatever state it preserved. The dry run deletes and switches nothing. This mode uses the recorded merged head instead of the verified pushed head.

## Triage a merge conflict

When the helper stops with `merge_conflict` on a pull request whose head is the trusted PBI head, triage the conflict as `standards/conflict-triage.md` says instead of ending the run. That standard owns preconditions, stages, stop rules, push provenance, and the record.

- After a verified triage push, end with `conflict-triaged` and do not merge. The new head needs `dod-guard:submit-draft-pr` convergence and `dod-guard:review-pr` before this skill runs again.
- If the triage stops, report the stop and leave the PR head unchanged.
- Any other helper stop ends the run.

A run on the cheap model does not triage. It stops at `merge_conflict`, reports the stop with the trusted head and the pull
request number, and leaves the head unchanged. Its dispatcher then runs the triage, as `standards/conflict-triage.md` says.

## Finalize the parent unit

Only after the helper returns a verified merge result, read the linked parent PBI, its linked children, and the one Project they share. A structured parent expects each linked child to match one independently delivered and verified functional slice from the task list. There is no fixed child count or category set. Finalize every child, plus every parent-level task that owns implementation, wiring and end-to-end usability, code quality, or failure and recovery.

### Prove convergence first

A structured parent must pass the finalization gate before anything is finalized. Feed it the durable handoff, which holds `records`, `tasks`, `children`, `reviewLenses`, `acceptance`, `acceptanceMatrix`, and the exact pushed `headSha`. The gate lives in `complete-pr/scripts/finalization-gate.mjs` and calls the exported `evaluateConvergence` API from `next-ticket/scripts/structured-workflow-proof.mjs`. Direct Project readback never replaces this proof. Proceed only if you require `outcome: "verified"`, and stop on any actionable remainder.

```js
import { evaluateStructuredFinalization } from "./scripts/finalization-gate.mjs";

const result = evaluateStructuredFinalization(handoff);
if (result.nextStep !== "project-status.mjs") throw new Error(result.remainder.join("; "));
```

Evidence rules the gate enforces:

- Each review lens resolves its `acceptanceEvidence` and `verificationEvidence` through the exact-head matrix.
- Every parent-level lens-owning task carries explicit acceptance and verification evidence in the durable handoff, read back before finalizing, even with no child commit.
- Mandatory user-path rows in the matrix prove wiring, usability, failure, and recovery at the exact head. The gate binds `wiring/usability` to `interactive-control` and `browser/e2e`, and `reliability` to `data/error` and `recovery`. One passing row cannot cover several lenses.

### Write Done

Resolve the shared Project number, REST item IDs, Status-field ID, and `Done` option ID once. Then run the status runner with child item IDs first and the parent item ID last:

```text
node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <done-option-id> Done <child-item-id> ... <parent-item-id>
```

An item ID is either its numeric REST id or its `PVTI_` global node id. The runner accepts both and refuses two IDs that name one item. Pass numeric ids: the runner reads them through the single-item endpoint, whereas a `PVTI_` id turns up only in the items list, which can lag behind a newly added item. The runner resolves the live REST field and item IDs, and reads each item back from the shared Project before continuing.

### Close children

For every code-backed child, verify its pushed commit is included in the verified merge. Close a still-open code-backed child only after that verification. If a parent or child is still Backlog, Todo, or In Progress after this pass, repair it and read it back before reporting completion. Never finalize a parent or child before the helper's merge result, and never alter unrelated Project items.

## Record completion and close replaced issues

After the finalization readback shows the delivered issues Done, record the evidence. Save the helper's JSON result and the acceptance-matrix rows as files. The record step then adds a `## Completion evidence` comment to each linked closing issue and each finalized child; `standards/project-workflow.md` defines that record:

```text
node <skill-dir>/scripts/closure.mjs record --repository=<owner/repository> --result=<helper-result.json> --matrix=<matrix-rows.json> --children=<child-number>,...
```

Record reads before writing, updates an existing record in place, and reads the result back, so a stopped run reruns it safely.

Next, build the closure snapshot that `standards/project-workflow.md` defines, plan against it, and apply the plan:

```text
node <skill-dir>/scripts/closure.mjs snapshot --repository=<owner/repository> --output=<file>
node <skill-dir>/scripts/closure.mjs plan --snapshot=<file>
node <skill-dir>/scripts/closure.mjs apply --snapshot=<file>
```

If snapshot exits non-zero, stop and report. Never plan or apply on an older file.

- `plan` only reads.
- `apply` re-plans the same snapshot, then takes each planned issue through read, evidence comment, close with its `state_reason`, readback, and Project Done. When a readback disagrees, it stops and shows the observed partial state.
- A rerun finishes the job: a rerun completes the remaining steps without a second comment; it also sets Done on an issue it already closed whose Project status write stopped.
- Report every hold with its reason.

Archived items are outside the snapshot, which holds only non-archived Project items. A root archived before apply stops closing the originals its `supersedes` record names. An archived sub-issue or parent has no record, so the parent walk holds that parent with `child #N readback missing` or `issue #P readback missing`. `unverified-closed` omits an owner's `not_planned` hand close that has no `supersedes` root, completion record, or closure evidence, and still reports a `completed` hand close without evidence. `standards/project-workflow.md` has the details.

Closing keywords and the helper's linked-issue confirmation are unchanged.

## Close delivered issues for goal-sdlc

`dod-guard:goal-sdlc` may delegate its start-of-run cleanup here. Run only this section: resolve no pull request and merge nothing. If the caller passed a snapshot it built, use that. Otherwise build one:

```text
node <skill-dir>/scripts/closure.mjs snapshot --repository=<owner/repository> --output=<file>
```

If snapshot exits non-zero, stop and report its error, and never plan or apply on an older file. On success, plan and then apply:

```text
node <skill-dir>/scripts/closure.mjs plan --snapshot=<file>
node <skill-dir>/scripts/closure.mjs apply --snapshot=<file>
```

Make no other issue or Project write. Report applied closes, status repairs, holds, `unverified-closed` reports (scoped as in the previous section), and any stop with the observed state.

## Result

Report: the PR; the accepted head; the final trusted head; the merge commit; linked issue state; remote branch deletion; parent and child Project finalization readback; completion records; closure closes and holds. Stop after helper success or a specific failure code, or the conflict triage ends with `conflict-triaged` or a stop. Publishing and plugin-cache refresh are separate workflows.
