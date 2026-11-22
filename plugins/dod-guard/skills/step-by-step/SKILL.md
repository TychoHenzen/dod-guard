---
name: step-by-step
description: Execute a short ordered plan one bounded step at a time through fresh subagents while the main thread owns checkpoints and verification.
---

# Step by step

Read and apply `standards/working-defaults.md` before starting. Run exactly one numbered plan, in order. This skill does not replace the repository's issue, branch, review, pull-request, or completion workflow.

The main thread owns the plan, current step, evidence, repair decision, and completion state. A subagent owns exactly one bounded active step, never picks the next step, and is never reused for a later step.

## Inputs

Accept one of:

- A numbered plan in the user request.
- One repository plan file, only if the user names it.
- An ordered plan from a calling skill (for example `dod-guard:goal-sdlc` stage rows or `dod-guard:next-ticket` tasks), with a proof per step and whether each verified step is committed.

Never search for plan files, infer a plan from a directory, or invent missing steps. Never revive chunking or workflow machinery. Never create a branch, pull request, or worktree for dispatch.

Before dispatch, restate the ordered steps, each step's verification, and the current repository and branch. Stop if the plan is empty, unordered, ambiguous, or unsafe.

- Empty: the plan has no numbered step.
- Unordered: a step depends on a later step, or the order is not stated.
- Ambiguous: a step has no expected proof, or its owned files or responsibility name two possible owners or none.
- Unsafe: a step needs credentials, edits a path outside the repository, deletes a file or branch the step did not create, or force-pushes, rebases, or rewrites published history. The one exception is the `--force-with-lease` push that `/publish` itself performs, which is not a step of a step-by-step plan.

## Command handles

An active command-session handle, in dispatch or proof, is in-progress state. Wait or poll that same handle to a terminal result, and keep the exact command and session evidence. Missing intermediate output is not a failure. Never start a second copy or a second step meanwhile.

Retry only after explicit cancellation or confirmed session failure. Record the exact command and handle first. Cancel only the process or session you own, and confirm it stopped.

Wait on every helper synchronously, in the foreground or by its completion notification. Never wait on a loop whose exit depends on a process being absent, such as a shell loop that ends when no `dotnet` process runs: stray long-lived processes keep it alive and stall the step.

## Execute one step

1. Record a checkpoint: step number, bounded objective, expected proof, current branch, prior completed steps, and the output of `git status --porcelain` taken just before dispatch (the baseline).
2. Dispatch one fresh subagent. Give it only the checkpoint, applicable repo instructions, owned files or responsibility, and a ban on branches, PRs, worktrees, and unrelated edits.
3. Tell the worker to wait for every child it dispatched to reach a terminal result before returning.
4. Tell the worker to finish each named proof in the foreground and include its final output and result in the report.
5. Tell the worker to revert every temporary probe or mutation the step added, keeping pre-existing and unrelated work.
6. Read the result and inspect the changed state. Compare `git status --porcelain` with the baseline from item 1. A stray path is a changed path outside the step's owned files that was not already dirty at dispatch. While a stray path exists, do not mark the step complete. Dispatch one repair task that names the stray paths and tells it to undo only the worker's edits there. Use `git checkout -p` only when an interactive terminal exists. Never use `git reset`, `git stash`, or `git checkout --`. Never revert a path that was already dirty at dispatch; for any path where the worker's edits cannot be told apart from earlier changes, stop and report it without marking the step complete, as for a stray path. This repair is the step's one repair under "Failures and repair". If stray paths remain after it, stop and report them.
7. Run the named proof yourself before marking the step complete.
8. If the plan asks for a commit per step and the step changed tracked files, stage only the paths the step checkpoint names, never `git add -A`, `git add .`, a glob, or the root. Run `git status --porcelain` and account for every `??` line (already ignored, newly ignored, or source the step meant to add) before the commit. Then commit the verified changes and read the commit back before the next step. A step that changes no tracked file records its evidence instead.
9. Record result, evidence, and next step in the checkpoint.

When the caller routes steps by tier, send the single "Stage brief" from `standards/model-routing.md` instead of steps 2 to 5, to the agent the caller's table names. The skill or standard named on its first line carries the branch, PR, and worktree rules.

## Failures and repair

On a failed or incomplete step, keep the checkpoint and the exact failure.

After a real failure, give one fresh bounded repair task the failed step, the error, and the required proof.

A result that names a live child, a pending named proof, or a still-applied temporary probe is incomplete, not failed. Do not start a repair task. Resume the same worker at the current checkpoint (for example by messaging it to finish), and dispatch nothing else, including a replacement, until it returns a terminal result.

Never skip forward or restart completed steps. If repair cannot establish the step's acceptance condition, stop and report the checkpoint plus the precise missing evidence. Tier-routed callers first climb one tier under "Escalation" in `standards/model-routing.md`, and stop only if that run also fails or already ran on the strong tier.

## Finish

After every step has fresh proof, report the ordered step results and any unresolved boundary.
