---
name: ratchet
description: Execute an existing OpenSpec change autonomously, one sub-problem per loop iteration, until every step in its steps.json passes and dod-guard cover shows no regressions. Use when a problem has interdependent sub-problems, unknown unknowns, or real regression risk, and a single-shot attempt would waste tokens on wrong approaches. It needs a confirmed OpenSpec change id that already exists. It does not gather requirements and it does not write the change's spec deltas or tasks.md. Every iteration proves one sub-problem and then re-runs the whole document, so earlier work cannot silently break. It captures branches with gitevo and persists lessons at the end. Triggers - "solve with ratchet", "ratchet this", "ratcheting workflow", "run the change autonomously", "loop until the steps pass".
---

# Ratchet

## Before you start

You need a confirmed OpenSpec change id. No change means no work. Route to
`/dod-guard:interview` or `/opsx:propose`, then come back. Every run of this
skill works against `openspec/changes/<change-id>/`.

## 1. Routing

Decide in the first two minutes.

| What you have | Where it goes |
|---|---|
| No change id yet | `/dod-guard:interview` first, then return here |
| A linear plan, or fewer than 5 steps | `/dod-guard:step-by-step` |
| A linear plan you want run by cheap workers | `/dod-guard:cheap-step` |
| Quality or security gates needed at each stage | `/dod-guard:adversarial-workflow` |
| Interdependent sub-problems plus regression risk | stay here |

`/dod-guard:interview` owns requirements, the tree, the company baseline, the
five-lens review, DoD creation, and the pre-code baseline run. Never redo any of
that here. If the tree looks wrong, send the user back to that skill.

## 2. Setup

Run these before any autonomous execution. Read-only work and checkpoints only.

1. Call `memory_recall` with the problem in your own words, keyed on the
   change id, to find prior attempts.
2. Call `evo_lessons` to read what earlier branches learned about this code.
3. Call `get_impact_radius_tool` on the modules the change touches, to see the
   blast radius. Call `get_minimal_context_tool` for the files you will edit.
4. Check for `openspec/changes/<change-id>/steps.json`. If it is missing, run
   `dod-guard steps <change-id>` to generate it from the change's `tasks.md`.
   If it exists, check it for staleness the same way `/dod-guard:step-by-step`
   does: compare `openspec status --json --change <change-id>` artifact
   statuses against the `plan_artifacts` snapshot recorded at generation time.
   Stale state means asking the user whether to replace it (regenerate with
   `dod-guard steps <change-id>`). Read every step's `status` in the file:
   this is the prior state, since ratchet keeps no separate progress log.
   Call `evo_summary` if a branch run started earlier.
5. Probe which servers answer. Call `status()` for evomcp. Tell the user what
   is missing and read section 7 for what that costs. Never degrade in
   silence.
6. Name the sub-problems from the `steps` array in `steps.json`. Each one is a
   step with an `id` you can pass to a scoped check.
7. Order the sub-problems by `deps`. A step whose output another step
   consumes goes first. Record the order as a numbered list.
8. Call `evo_init`, then `evo_checkpoint` with a name like `baseline` and a
   description of the starting state.
9. Show the user the ordered list and ask for approval.

Do not start Phase B until the user approves the order. State the count of
sub-problems, the first one you will attempt, and the branch name you will use.

### Proof commands run on the host OS

You will author commands in step 2 of the iteration. Write them for the machine
this runs on, not for a generic shell.

On Windows, use `findstr` rather than `grep`, and write backslash paths.
cmd.exe does not expand file globs. dod-guard expands directory globs such as
`packages/*/` on Windows, but never file globs, so write file paths in full.

Prefer `exit_code` over `output_contains` for a test runner. Node's TAP output
carries no "tests pass" string, so a substring match there passes or fails for
the wrong reason.

## 3. Phase B: the loop

Start `/loop` with the iteration prompt as its argument. A bare `/loop` only
prints usage and never enters dynamic mode.

Each iteration handles exactly one sub-problem and then calls `ScheduleWakeup`
to queue the next one. Iterations never overlap, so never schedule two. Context
carries forward across iterations, so record decisions in the conversation
rather than re-deriving them.

Set `delaySeconds` between 60 and 120 while you are working sub-problems. Set
300 or more when you are waiting on something outside the repository. An
iteration that ends without calling `ScheduleWakeup` gets one fallback wakeup
after roughly 20 minutes, and then the loop dies. Always schedule.

To end the loop deliberately, call `ScheduleWakeup` with `stop=true`.

The rule that makes this a ratchet: an iteration is finished only when the
step's own `verify_cmd` passes and `dod-guard cover <change-id>` still passes.
Never accept a green step while another step has regressed.

## 4. The iteration prompt

Pass this block forward on every cycle. Fill the placeholder first.

```
Sub-problem: <step id and title from the approved order>
Change: <change-id>

1. Call evo_spawn with the last good checkpoint name and a new_branch named
   after this sub-problem. Work only on that branch.
2. Implement the sub-problem. Write the failing test first when the step's
   task description calls for test-first work.
3. Verify the step: run its own `verify_cmd` from steps.json as a plain shell
   command. Exit 0 passes. Any other exit code fails. A `manual_required` step
   has no `verify_cmd` - hold it at pending and ask the user to confirm it by
   hand instead of running anything.
4. On a failing exit code, repair and re-run step 3. Cap this at 3 repair
   attempts.
5. Run the project formatter over the changed files. A stale format reads as a
   regression in the next step.
6. Run the regression check: `dod-guard cover <change-id>`. Any scenario that
   regressed from its prior recorded outcome is a regression. Fix the
   regression before anything else. It never justifies changing that
   scenario.
7. Call evo_checkpoint with the sub-problem name and what changed.
8. Call evo_learn with one sentence on what worked or what failed.
9. Call ScheduleWakeup for the next sub-problem in the approved order.

Stop conditions, checked in this order:
- Every step's verify_cmd passes, and every manual_required step is confirmed
  by the user: go to section 6. That is the success state.
- A verify_cmd is failing after 3 repair attempts: escalate, see section 5.
- The approved order is exhausted and a step still fails: escalate.
- Three sub-problems in a row escalated with no progress: stop the loop and
  hand the whole problem back to the user.

If the approach itself is wrong rather than merely stuck, call evo_abandon
with the checkpoint and a reason, then move to the next sub-problem.

Escalation trigger: you are about to weaken a verify_cmd, loosen what a step
checks, delete an assertion, or mark a step passing without actually running
its check. Stop instead and escalate.
```

## 5. When a sub-problem will not pass

Cap repair attempts at 3 per sub-problem. After the third, stop and report to
the user. Give the sub-problem name, the failing step, the exact command output,
the three approaches you tried, and what you believe the real obstacle is.

The 3-repair-attempt cap from section 4 is the escalation trigger. There is no
separate amend-count or STUCK signal. Never make a check pass by weakening the
step's own `verify_cmd`. If the `verify_cmd` itself looks wrong rather than the
implementation, spending one of the three repair attempts to fix the command is
fine, but weakening it to force a pass is never acceptable - stop and ask the
user instead.

A step with no `verify_cmd` (`manual_required: true` in steps.json) is exactly
the human-judgment case. Collect those steps and hand them to the user at the
end.

## 6. Finish

Finish when every step's `verify_cmd` passes and every `manual_required` step
is confirmed by the user. There is no INCOMPLETE/PASS/exit-code vocabulary
here - a failing `verify_cmd` that repair attempts could not clear is what
blocks the finish.

1. Add a regression proof for each edge case the run turned up. Append a
   `### Requirement:`/`#### Scenario:` to the change's spec delta and a
   matching `tasks.md` item carrying a `covers:` marker, then re-run
   `dod-guard steps <change-id>` to regenerate `steps.json` with the new step.
   This is how the ratchet gains a tooth from what the run learned.
2. Call `evo_adopt` with the winning branch, then `evo_finish`.
3. Call `evo_export_lessons`, then `memory_save` with `type: "project"` and the
   exported content.
4. Run `dod-guard cover <change-id>`. It checks each scenario in the change's
   spec deltas against a ratcheted baseline. Exit 0 means every scenario
   matches or improves on the baseline. Exit 1 means one regressed. Exit 3
   means usage error. On exit 1 or exit 3, stop here: report the regression
   and do not archive.
5. On exit 0, run `openspec archive <change-id> --yes`. It merges the change's
   spec deltas into openspec/specs/ and moves the change under
   changes/archive/. Run archive without asking the user first, the cover
   check is the approval.
6. Report the passing step count, the branches you abandoned, the cover and
   archive outcome, and every `manual_required` step the user still owes.
7. Call `ScheduleWakeup` with `stop=true`.

## 7. Missing servers

dod-guard alone is enough to run this skill. Each other server buys one named
behavior, and its absence narrows the run without stopping it.

| Server absent | What you lose, and what to do |
|---|---|
| gitevo | No branches and no checkpoints. Work on the current branch and commit after each sub-problem. |
| obsidian-rag | No recall and no persistence. Skip setup steps 1 and finish step 2. |
| code-review-graph | No impact analysis. Read callers and tests by hand in setup step 3. |
| evomcp | No fanout. Implement each sub-problem directly. |

When evomcp is present and a sub-problem has a clean scoped check, delegate it.
Call `solve` with one `spec` object: `{goal, verify_cmd, cwd}`, where
`verify_cmd` is the step's own command from `steps.json`, for example
`node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`.
Add `strategy` as `"auto"`, `"best-of-n"`, or `"evolve"`, plus `budget_tokens`
and `fanout` when you want to bound the run. Use `evolve` with `{goal,
fitness_cmd, cwd, target_files}` only for a numeric score you want to push.
Both are one object, never loose arguments.
