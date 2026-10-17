---
name: complete-pr
description: Complete a verified open pull request through guarded REST merge, required checks, linked-issue confirmation, and remote branch deletion.
---

# Complete PR

Invoking this skill is the final acceptance gate for the current PR, not a separate human-approval step. The caller must have verified the head, linked child acceptance, review remediation, required checks, and cleanup first. Do not infer the gate from comments, passing checks, or earlier commands.

Apply `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root; stricter rules here win. Follow the [command-composition contract](../../docs/command-composition.md).

## Resolve the pull request

1. Confirm the cwd is inside a Git checkout. Run `git status --short`.
2. Classify pending paths without changing them. Preserve changes that clearly belong to the accepted PBI. Stop for secrets, destructive intent, or unrelated or indistinguishable work.
3. Run `gh auth status` and require `repo` access.
4. Resolve the repository and default branch with the GitHub MCP repository operation, or `gh repo view --json nameWithOwner,defaultBranchRef,url` without MCP.
5. Resolve the single open PR for the current branch, or use the number given. Accept a draft or ready PR only if its head is in this repository and its base is the default branch.
6. Read the PR, linked issue, review result, and latest verification evidence. Stop if the PR no longer represents the reviewed and verified code.
7. If pending changes clearly belong to the accepted PBI, stage only those reviewed paths, commit, push, and reread head and evidence. Then stop unless the new head has fresh review and verification evidence.

## Preflight checkpoint

Read the `## Preflight checkpoint` from the implementation handoff (format in `standards/project-workflow.md`). Before any ready transition, branch update, merge, or cleanup, require the exact head, base ref and SHA, mergeability, and a complete row for every required provider context. Stop with expected and observed values on missing, pending, failed, unavailable, stale, duplicate, forked, or provider-mismatched evidence, never inferred from a passing aggregate. An exact-head `skipped` context counts as passing.

To recover a draft-skipped workflow, verify draft readiness at the same ref and head, dispatch once through the existing guarded workflow owner, and read back run, workflow, ref, and head before waiting.

A base advance invalidates the handoff and acceptance matrix. Bounded branch synchronization is the only recovery, and it needs fresh acceptance and required-check proof at the final head. On an unresolvable conflict, unexpected branch movement, failed readback, or a second dispatch, stop before any merge, cleanup, force-push, or generated-ref mutation.

## Review threads

After the head converges and before any mutation, read every review thread. Every unresolved thread counts, whatever its author or outdated state.

- Unresolved threads stop the run with `unresolved-review-threads`. Name each thread's URL and path.
- A failed, malformed, or incompletely paginated read stops with `review-threads-unavailable` before ready, auto-merge, CI dispatch, or merge.
- The remedy is `dod-guard:fix-pr-review` or resolving the thread, then rerunning this skill.

Reread them before each merge request and stop the same way.

## Run the helper

Resolve the skill directory from the loaded SKILL.md. Pass repository and PR number as separate native arguments. Keep a non-zero preflight result.

```text
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number> --pushed-head <verified-head-sha>
```

Pass the exact pushed head SHA already verified. The helper never adopts a mutable provider head as its first acceptance signal. It readies the draft, dispatches CI if needed, waits for every required check, merges through REST with the expected head SHA, confirms the linked issue, and deletes the remote branch. Local cleanup touches only the current checkout, and only when it is clean and fast-forwardable; report any preserved checkout state or local ref, and never touch another checkout. A successful workflow run alone is not acceptance.

- `merge_conflict`: see "Triage a merge conflict".
- Every other stop, including `missing_required_checks` and `base_branch_missing`: report it and end the run.

Never use `--admin`, force-push, weaken repository protections, or delete a ref whose SHA differs from the merged PR head.

## Recover a merged PR

Use recovery when a prior run merged the PR but stopped before cleanup; check live state first. It accepts only a merged PR with complete required checks, closed linked issues, and `Done` Project status. It deletes the remote head only if it still points at the merged head.

```text
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number> --recover-merged --dry-run
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number> --recover-merged
```

A dry run deletes and switches nothing.

## Triage a merge conflict

When the helper stops with `merge_conflict` on the trusted PBI head, triage per `standards/conflict-triage.md`, which owns the preconditions, stages, stop rules, and record.

- After a verified push, end with `conflict-triaged` and do not merge. The new head needs `dod-guard:submit-draft-pr` convergence and `dod-guard:review-pr` before this skill runs again.
- If the triage stops, report it and leave the head unchanged.
- A run on the cheap model must not triage. It reports the stop with trusted head and PR number and leaves the head unchanged. Its dispatcher runs the triage.

## Finalize the parent unit

Start only after the helper returns a verified merge result. Never alter unrelated Project items.

1. Read the linked parent PBI, its linked children, and their one shared Project. For a structured parent, each child must match one independently delivered and verified functional slice. No fixed child count or category set applies.
2. Finalize every linked child and every parent-level task owning implementation, wiring and end-to-end usability, code quality, or failure/recovery.
3. Resolve the Project number, item IDs, Status-field ID, and `Done` option ID once.
4. For a structured parent, run the current handoff through the gate. Stop on any actionable remainder.

```js
import { evaluateStructuredFinalization } from "./scripts/finalization-gate.mjs";
const result = evaluateStructuredFinalization(handoff);
if (result.nextStep !== "project-status.mjs") throw new Error(result.remainder.join("; "));
```

The gate calls `evaluateConvergence` from `next-ticket/scripts/structured-workflow-proof.mjs`. It needs `records`, `tasks`, `children`, `reviewLenses`, `acceptance`, `acceptanceMatrix`, and the exact pushed `headSha`, with `outcome: "verified"`. Any other outcome stops finalization, and Project readback never replaces it. Each parent-level task owning a review lens needs `acceptanceEvidence` and `verificationEvidence` in the durable handoff, even with no child commit. Lens `wiring/usability` binds to `interactive-control` and `browser/e2e` rows, and `reliability` to `data/error` and `recovery` rows. One row cannot cover several lenses.

5. For each code-backed child, verify its pushed commit is in the verified merge. Close a still-open child only after that check.
6. Run the status runner with child item IDs first and the parent last.

```text
node <plugin-root>/skills/complete-pr/scripts/project-status.mjs <owner> <project-number> <status-field-node-id> <done-option-id> Done <child-item-id> ... <parent-item-id>
```

Prefer numeric REST ids: a `PVTI_` id comes only from the items list, which can lag. The runner refuses two IDs for one item.

7. If a parent or child is still Backlog, Todo, or In Progress, repair it and read it back before reporting completion.

## Record completion and close replaced issues

After readback shows the delivered issues `Done`, save the helper's JSON result and the handoff's acceptance-matrix rows to files. Record evidence on each linked closing issue and finalized child, in the `## Completion evidence` format from `standards/project-workflow.md`. Recording is safe to rerun.

```text
node <skill-dir>/scripts/closure.mjs record --repository=<owner/repository> --result=<helper-result.json> --matrix=<matrix-rows.json> --children=<child-number>,...
node <skill-dir>/scripts/closure.mjs snapshot --repository=<owner/repository> --output=<file>
node <skill-dir>/scripts/closure.mjs plan --snapshot=<file>
node <skill-dir>/scripts/closure.mjs apply --snapshot=<file>
```

If snapshot exits non-zero, stop and report its error. Never plan or apply on an older file. The snapshot, holds such as `child #N readback missing` and `issue #P readback missing`, and `unverified-closed` scope are defined in `standards/project-workflow.md`. `plan` is read-only. `apply` closes each planned issue with its `state_reason` (`completed` or `not_planned`). It stops with the observed partial state on a readback disagreement, and a rerun finishes the rest. Report each hold with its reason.

## Close delivered issues for goal-sdlc

When `dod-guard:goal-sdlc` delegates its start-of-run cleanup, run only this section. Resolve no PR and merge nothing. Use goal-sdlc's snapshot or run `closure.mjs snapshot`; if snapshot exits non-zero, stop and report its error, and never plan or apply on an older file. Then plan and apply; apply also sets Project `Done`, including on an issue already closed whose status write stopped. Report closes, status repairs, holds, `unverified-closed` reports, and any stop. Make no other issue or Project write.

## Result

Report the PR, heads, merge commit, issue state, branch deletion, Project readback, records, and closures.
