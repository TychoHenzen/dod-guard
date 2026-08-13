# dod-guard/ratchet Specification

## Purpose
Skill that executes an existing OpenSpec change autonomously in a loop, solving one sub-problem per iteration, re-running the whole verification document each time so earlier work cannot silently break. Captures branches with gitevo and persists lessons at the end.

## Requirements

### Requirement: requires a confirmed OpenSpec change id
The skill SHALL NOT gather requirements or write spec deltas. It requires an existing, confirmed OpenSpec change id with `steps.json` already generated. When no change id is provided, the skill SHALL route to `/interview` or `/opsx:propose`.

#### Scenario: no change id provided
- **WHEN** the user invokes `/ratchet` without a change id
- **THEN** the skill routes to `/interview` to gather requirements first

#### Scenario: change id provided but steps.json missing
- **WHEN** the user provides a change id and no steps.json exists for it
- **THEN** the skill generates steps.json with `dod-guard steps` before starting the loop

#### Scenario: change id with existing steps.json
- **WHEN** the user provides a change id and a valid steps.json already exists
- **THEN** the skill reads the prior state from steps.json and resumes from the first `pending` step

### Requirement: routing to the right executor
The skill SHALL evaluate the plan shape before starting its loop. It SHALL route to `/step-by-step` for straightforward sequential plans, `/cheap-step` for plans with 5 or more cheap-eligible steps, and `/adversarial-workflow` for work needing phased review. It stays with ratchet only when the work has interdependent sub-problems, unknown unknowns, or real regression risk.

#### Scenario: sequential plan routes away
- **WHEN** the plan has 4 independent steps with no regression risk
- **THEN** the skill routes to `/step-by-step` instead of running its own loop

#### Scenario: cheap-eligible plan routes to cheap-step
- **WHEN** the plan has 5 or more steps eligible for cheap workers
- **THEN** the skill routes to `/cheap-step`

#### Scenario: interdependent sub-problems stay with ratchet
- **WHEN** the plan has sub-problems that depend on each other and carry regression risk
- **THEN** the skill stays with ratchet and begins its own loop

### Requirement: one sub-problem per iteration
Each loop iteration SHALL solve exactly one sub-problem. The iteration SHALL: spawn a gitevo branch, implement the fix, verify the step's verify_cmd, run `dod-guard cover` for regression checks, checkpoint on success, and learn on failure.

#### Scenario: iteration solves and checkpoints
- **WHEN** a sub-problem's verify_cmd passes and `dod-guard cover` shows no regressions
- **THEN** the skill calls `evo_checkpoint` and advances to the next sub-problem

#### Scenario: iteration fails verify_cmd
- **WHEN** a sub-problem's verify_cmd exits non-zero
- **THEN** the skill repairs and re-runs the verify_cmd, up to 3 repair attempts

#### Scenario: manual_required step held for user
- **WHEN** the iteration reaches a step with `manual_required: true` and no verify_cmd
- **THEN** the skill holds it at pending and asks the user to confirm by hand

### Requirement: ratchet rule - step pass AND no regressions
A sub-problem SHALL be marked complete only when its verify_cmd passes AND `dod-guard cover` shows no regressions across the entire change. Passing the step alone is not sufficient.

#### Scenario: step passes but cover regresses
- **WHEN** a sub-problem's verify_cmd exits 0 but `dod-guard cover` reports a regression in another scenario
- **THEN** the skill does not mark the sub-problem as complete and enters the repair cycle

#### Scenario: both step and cover pass
- **WHEN** a sub-problem's verify_cmd exits 0 and `dod-guard cover` shows no regressions
- **THEN** the skill marks the sub-problem as complete and checkpoints

#### Scenario: step verify_cmd fails
- **WHEN** a sub-problem's verify_cmd exits non-zero
- **THEN** the skill enters the repair cycle without running `dod-guard cover`

### Requirement: 3-attempt repair cap per sub-problem
Each sub-problem SHALL have at most 3 repair attempts. After 3 failures, the sub-problem is escalated to the user. The skill SHALL NOT weaken or modify the verify_cmd to make it pass.

#### Scenario: repair cap exhausted
- **WHEN** a sub-problem fails verification 3 times
- **THEN** the skill escalates to the user with the failing step, exact output, and three approaches tried

#### Scenario: repair succeeds on second attempt
- **WHEN** the first repair attempt fails but the second passes verification and cover
- **THEN** the skill checkpoints and advances to the next sub-problem

#### Scenario: three consecutive escalations stop the loop
- **WHEN** three sub-problems in a row escalate with no progress
- **THEN** the skill stops the loop and hands the whole problem back to the user

#### Scenario: weakening verify_cmd triggers escalation
- **WHEN** the repair approach would weaken a verify_cmd or delete an assertion
- **THEN** the skill stops and escalates instead of applying the weakening change

### Requirement: gitevo integration for branch management
The skill SHALL call `evo_init` at setup, `evo_spawn` before each sub-problem, `evo_checkpoint` after each success, and `evo_learn` after each failure. At completion it SHALL call `evo_adopt` or `evo_finish` and `evo_export_lessons` for memory persistence.

#### Scenario: gitevo unavailable
- **WHEN** the gitevo MCP server is not connected
- **THEN** the skill operates without branch isolation, using plain git commits, and skips lesson export

#### Scenario: gitevo available
- **WHEN** the gitevo MCP server is connected
- **THEN** the skill spawns a branch for each sub-problem, checkpoints after each success, and learns after each failure

#### Scenario: wrong approach triggers evo_abandon
- **WHEN** the approach itself is wrong rather than merely stuck
- **THEN** the skill calls `evo_abandon` with the checkpoint and a reason, then moves to the next sub-problem

### Requirement: finish with coverage proof and archive
After all sub-problems are resolved, the skill SHALL run `dod-guard cover` one final time. On exit 0, it SHALL run `openspec archive` on the change. Regression proofs discovered during the loop SHALL be added as new scenarios before archiving.

#### Scenario: final cover passes
- **WHEN** all sub-problems pass and the final `dod-guard cover` exits 0
- **THEN** the skill archives the OpenSpec change and reports completion

#### Scenario: final cover regresses
- **WHEN** the final `dod-guard cover` exits 1 reporting a regression
- **THEN** the skill does not archive and reports the regression to the user

#### Scenario: cover exits with usage error
- **WHEN** `dod-guard cover` exits 3
- **THEN** the skill stops and reports the usage error without archiving

#### Scenario: regression proofs added before archiving
- **WHEN** the loop discovered edge cases that turned up as regressions during iterations
- **THEN** the skill appends new Requirement and Scenario blocks to the change's spec delta before archiving

### Requirement: loop uses ScheduleWakeup
The skill SHALL use `ScheduleWakeup` with 60-120 second delays between iterations. It SHALL use `/loop` mode and stop the loop when all sub-problems are resolved or the user interrupts.

#### Scenario: loop stops on completion
- **WHEN** the last sub-problem passes and the final cover check succeeds
- **THEN** the skill calls `ScheduleWakeup` with `stop: true`

#### Scenario: iteration schedules next wakeup
- **WHEN** an iteration finishes with sub-problems still remaining
- **THEN** the skill calls `ScheduleWakeup` with a delay between 60 and 120 seconds

#### Scenario: missing wakeup kills the loop
- **WHEN** an iteration ends without calling `ScheduleWakeup`
- **THEN** the loop receives one fallback wakeup after roughly 20 minutes, then dies
