---
name: quick-pbi
description: Run a user-requested GitHub PBI from backlog capture through refinement, implementation, draft PR, review, fixes, and guarded merge with no prompts except material refinement clarifications.
argument-hint: "<requested outcome>"
---

# Quick PBI

Run one complete PBI lifecycle. This skill coordinates the existing delivery
skills and does not replace their safety gates or evidence requirements.

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the plugin root. Load each
referenced skill from the active plugin root before invoking it.

## Interaction contract

- Treat invoking this skill as authorization for the listed lifecycle,
  including commits, pushes, review publication, and `/complete-pr` for the
  final verified pull request head.
- Ask no confirmation between stages. The only allowed user interaction is the
  batched clarification round owned by `/refine-backlog-item`.
- Use the current repository or an explicitly supplied target repository. If
  the target, linked Project, credentials, branch, head, or required evidence
  cannot be resolved, stop and report the exact blocker instead of asking the
  user to choose a fallback.
- Never invent a requirement or silently continue past a failed gate.

## Run the lifecycle

1. Invoke `/add-backlog-idea` once with the complete user request. Keep its
   feature split and issue mappings. If it creates multiple independent
   issues, process them one at a time in creation order. If capture reports
   text that cannot be assigned to a feature, stop with that blocker and do not
   ask the user to assign it or guess where it belongs.
2. For each created issue, invoke `/refine-backlog-item <issue-number>`.
   When refinement finds missing user constraints, ask all currently
   independent questions in one round, wait for the answers, and resume the
   same issue. Do not ask questions in any other stage. If a material answer
   remains unavailable, leave the issue in its actual state and stop.
3. Invoke `/next-ticket <issue-number>` after refinement moves the issue to
   `Todo`. Use its pushed branch, commit, completion-review result, and checks
   as the implementation handoff. Do not select another ticket.
4. Invoke `/submit-draft-pr <issue-number>` and retain the returned pull
   request and head.
5. Invoke `/review-pr <pull-request>` on that exact head. A completed
   `APPROVE`, `REQUEST_CHANGES`, or `BLOCK` recommendation is a successful
   review and consumes the one-review slot, including when it contains
   findings. `/review-pr` is the authoritative producer: its terminal report
   maps accepted `BLOCKER` findings to `BLOCK`, other accepted findings to
   `REQUEST_CHANGES`, and no accepted findings to `APPROVE`; a GitHub
   `COMMENT` review is only publication transport. Record that report's
   recommendation as `reviewResult`, its head as `reviewedHead`, and
   `reviewerStatus=completed` in the durable ledger. A launcher or process
   failure is incomplete only when it produces no
   terminal report with a recommendation; validation, coverage, findings, and
   required-check results in an existing report are completed review evidence,
   not an incomplete execution. For an incomplete execution, record the exact
   failure class and evidence, read back the ledger and remote review state,
   repair the cause, verify the repair, and retry until a completed
   recommendation exists; do not repeat an unchanged failure blindly. For a
   timeout or interruption, first confirm the prior reviewer has stopped, then
   reconcile the ledger and remote PR state and consume any late report before
   retrying. If the cause cannot be repaired, preserve the checkpoint and stop
   with a durable blocker. For a completed result with actionable findings,
   invoke `/fix-pr-review <pull-request> <finding-ids>` with every valid
   unresolved finding, rerun affected checks, and respond to and resolve each
   finding. Do not invoke another reviewer after those fixes; continue to
   `/complete-pr` when no actionable findings remain.
6. Invoke `/complete-pr <pull-request>` only after the final review is clean,
   all required checks pass, and the pull request head is unchanged. Its
   guarded merge is the acceptance boundary authorized by this skill.

If any stage fails, stop without rollback or duplicate issues. Report completed
issue, branch, pull request, commit, review, check, Project, and merge state,
then report the exact failed stage and its next required evidence or decision.
