---
name: step-by-step
description: Execute a short ordered plan one bounded step at a time through fresh subagents while the main thread owns checkpoints and verification.
---

# Step by step

Read and apply `standards/working-defaults.md` from the plugin root.

The main thread owns the plan, current step, evidence, repair decision, and completion state. A subagent owns exactly one bounded step and never picks the next one. This skill does not replace the repository's issue, branch, review, pull request, or completion workflow. Use `dod-guard:next-ticket` for ticket delivery.

## Inputs

Accept only one of these sources:

- An explicit numbered plan in the user's request.
- One repository plan file that the user names explicitly.
- A plan handed over mid-run: an ordered plan that a calling skill passes.

Do not search for plan files, and do not infer a plan from a directory. Do not revive chunking or workflow machinery. Do not invent steps. Do not create a branch, pull request, or worktree.

The plan must state the proof for each step and whether each verified step is committed. Before any dispatch, restate the steps, their proofs, and the current branch. Stop and report if the plan is empty, unordered, ambiguous, or unsafe.

## Execute one step

For each step, in order:

1. Record the checkpoint: the step number, its bounded objective, the expected proof, the current branch, the commit, the state of the working tree, and the prior completed steps.
2. Dispatch one fresh subagent for this step only. Pass it the checkpoint, the repository instructions, and the files the step owns, and nothing else: the brief is only that checkpoint plus the repository instructions and the owned files. The brief also tells the worker, before it returns, to wait for every child it dispatched to reach a terminal result, to finish each named proof in the foreground, to include each named proof's final output and result in its report, and to revert every temporary probe or mutation the step introduced while preserving pre-existing and unrelated work. The brief includes a prohibition on branches, pull requests, worktrees, or unrelated edits. When the calling skill routes its steps by tier, as `dod-guard:goal-sdlc` does, the brief is instead the one "Stage brief" in `standards/model-routing.md` defines, sent to the agent that the caller's table names for the step. In that mode, the skill named on the first line of the brief carries the branch, pull request, and worktree rules.
3. Read the subagent result. Inspect the changed state itself, not just what the worker reports. Run the step's named proof before marking it complete.
4. If the plan asks for a commit per step and the step changed tracked files, the main thread commits the verified changes and reads the commit back before the next step starts. A step that changes no tracked file records its evidence instead of a commit.
5. Record the result, evidence, and next step.

Do not reuse a worker for an unrelated later step. Do not dispatch a second step while the active step lacks a terminal result. Do not skip forward or restart completed steps.

A command that still holds an active session handle is in-progress, not failed. The main thread will wait or poll that same handle to a terminal result. Missing output is not a result, so do not treat missing intermediate output as failure or dispatch another copy. The main thread will retry only after explicit cancellation or confirmed session failure. It must preserve the exact command and session evidence. When cancellation is needed, end only the invocation-owned process or session, and confirm it stopped before any repair starts.

## Failures and repair

A step that fails its proof or returns a failed result gets one fresh bounded repair task. On failure, record the exact command and its session handle. Give the repair worker the checkpoint, the failed step, the error, the required proof, and the same owned files.

When a worker report names a live child, a pending named proof, or a still-applied temporary probe, the step is incomplete but is not a failed step, and the fresh repair task above does not apply to it. The main thread resumes that same worker at the current checkpoint and dispatches nothing else, including a replacement, until that worker returns a terminal result.

If repair cannot establish the step's acceptance condition, stop with the checkpoint and the precise missing evidence, unless the calling skill routes its steps by tier: then the step climbs one tier under "Escalation" in `standards/model-routing.md` first, and stops only when that escalated run also fails or when it already ran on the strong tier.

## Finish

After the last step, run a fresh proof for every step. Then report the ordered step results and any unresolved boundary.
