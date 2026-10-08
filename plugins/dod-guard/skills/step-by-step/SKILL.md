---
name: step-by-step
description: Execute a short ordered plan one bounded step at a time through fresh subagents while the main thread owns checkpoints and verification.
---

# Step by step

Read and apply `standards/working-defaults.md` from the plugin root.

Execute one numbered plan in order. The main thread owns the plan, current
step, evidence, repair decision, and completion state. A subagent owns exactly
one bounded active step and never chooses the next step.

## Inputs

Accept one of:

- an explicit numbered plan in the user request;
- one repository plan file that the user names explicitly; or
- an ordered plan that a calling skill passes, such as the stage rows of
  `dod-guard:goal-sdlc` or the task list of `dod-guard:next-ticket`, with a
  proof for each step and whether each verified step is committed.

Do not search for plan files, infer a plan from a directory, invent missing
steps, revive chunking/workflow machinery, or create a branch, pull request, or
worktree for dispatch.

Before dispatching, restate the ordered steps, the verification for each, and
the current repository/branch. Stop for an empty, unordered, ambiguous, or
unsafe plan.

If the command tool returns an active session handle for dispatch or proof,
treat it as in-progress: wait or poll that same handle to a terminal result,
preserve the exact command and session evidence, and do not treat missing
intermediate output as failure or dispatch another copy.

## Execute one step

For each step, in order:

1. Record a compact checkpoint: step number, bounded objective, expected proof,
   current branch, and prior completed steps.
2. Dispatch one fresh subagent with only that checkpoint, applicable repository
   instructions, owned files/responsibility, and a prohibition on branches,
   pull requests, worktrees, or unrelated edits.
3. Read the subagent result and inspect the changed state. Run the step's named
   proof before marking it complete.
4. When the plan asks for a commit per step and the step changed tracked
   files, the main thread commits the verified changes and reads the commit
   back before the next step starts. A step that changes no tracked file
   records its evidence instead of a commit.
5. Record the result, evidence, and next step in the main-thread checkpoint.

Do not reuse a worker for an unrelated later step. Do not dispatch a second
step while the active step lacks a terminal result or its command-session
handle is still active.

## Failures and repair

On a failed or incomplete step, preserve the checkpoint and exact failure. An
active handle is not an incomplete result: continue waiting or polling that
same invocation, and retry only after explicit cancellation or confirmed
session failure. Record the exact command and handle; cancel only the
invocation-owned process or session when required, confirm it stopped, then
give one fresh bounded repair task the failed step, error, and required proof.
Do not skip forward or restart completed steps. If repair cannot establish the step's
acceptance condition, stop with the checkpoint and the precise missing evidence.

## Finish

After every step has fresh proof, report the ordered step results and any
unresolved boundary. This skill does not replace the repository's issue, branch,
review, pull-request, or completion workflow.
