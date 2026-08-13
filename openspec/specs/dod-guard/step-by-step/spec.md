# dod-guard/step-by-step Specification

## Purpose
Executes a confirmed multi-step plan one atomic step at a time. Dispatches each step to a specialized worker agent, verifies the result, and persists progress in `steps.json` so interrupted sessions can resume.

## Requirements

### Requirement: one step at a time, no parallel execution
The skill SHALL execute exactly one step per cycle. It SHALL NOT start a new step until the current step's verification passes or its repair budget is exhausted. Steps SHALL execute in dependency order as defined in `steps.json`.

#### Scenario: dependent step waits
- **WHEN** a later step depends on an earlier step that is not yet completed
- **THEN** the skill does not start the later step

#### Scenario: all dependencies satisfied
- **WHEN** every step in a step's `deps` array shows `completed`
- **THEN** the skill starts that step without waiting

#### Scenario: independent steps follow array order
- **WHEN** two steps have no dependency on each other
- **THEN** the skill executes them in the order they appear in the steps array

### Requirement: worker dispatch by step type
The skill SHALL dispatch each step to the worker agent that matches its type. Plain implementation goes to `step-implementer`. TDD steps go to `step-tdd-implementer`. Steps that name a symptom go to `step-debugger`. Compile, type, or import errors go to `step-build-fixer`. The orchestrator SHALL NOT implement steps itself.

#### Scenario: TDD step dispatches to TDD implementer
- **WHEN** a step carries a `tdd` predicate or a red-first requirement
- **THEN** the skill dispatches it to `step-tdd-implementer`

#### Scenario: ordinary change dispatches to step-implementer
- **WHEN** a step describes a plain implementation change with no special predicate
- **THEN** the skill dispatches it to `step-implementer` at sonnet tier

#### Scenario: compile error dispatches to build-fixer
- **WHEN** a step describes a compiler, type, or import failure
- **THEN** the skill dispatches it to `step-build-fixer` at haiku tier

#### Scenario: worker returns AMBIGUOUS
- **WHEN** a worker returns AMBIGUOUS with multiple interpretations
- **THEN** the skill surfaces the question to the user and re-dispatches with the answer

### Requirement: verification after every step
Each step SHALL have a `verify_cmd` that the orchestrator runs after the worker returns. A step passes when its verify_cmd exits 0. The orchestrator verifies independently rather than trusting the worker's claim.

#### Scenario: worker claims success but verify_cmd fails
- **WHEN** the worker reports success but the step's verify_cmd exits non-zero
- **THEN** the skill marks the step as failed and enters the repair cycle

#### Scenario: verify_cmd passes and step gets committed
- **WHEN** the verify_cmd exits 0 after the worker finishes
- **THEN** the skill commits the step's changes as the rollback point

#### Scenario: structural surface requires diff reading
- **WHEN** a step's verify_surface is `structural`
- **THEN** the skill reads the diff to confirm changes stayed within the step's files list

### Requirement: bounded repair budget
Each step SHALL have a repair budget of two attempts. When both fail, the skill SHALL pivot once by rewriting the step description to name the failed approach. Two more attempts run under the new description. When the second pair also fails, the skill SHALL mark the step blocked and stop. No third pivot is allowed.

#### Scenario: repair budget exhausted
- **WHEN** a step fails verification twice under its original description and twice more after a pivot
- **THEN** the skill marks the step as blocked, stops the session, and reports what was tried

#### Scenario: second attempt succeeds without pivot
- **WHEN** the first repair attempt fails but the second passes verification
- **THEN** the step is marked completed without a pivot

#### Scenario: pivot succeeds after original description fails
- **WHEN** both attempts under the original description fail and the first attempt under the rewritten description passes
- **THEN** the step is marked completed

### Requirement: persistence in steps.json
The skill SHALL write each step's status to `steps.json` after each state change. Valid states are `pending`, `completed`, `skipped`, and `blocked`. A new session SHALL resume from the last persisted state.

#### Scenario: session interruption and resume
- **WHEN** a session ends with the third step in progress and the first two completed
- **THEN** a new session reads `steps.json` and resumes from the third step

#### Scenario: tasks.md line checked off with step completion
- **WHEN** a step's status changes to `completed` in steps.json
- **THEN** the matching line in tasks.md flips from `- [ ]` to `- [x]` in the same update

#### Scenario: skipped or blocked step stays unchecked
- **WHEN** a step is marked `skipped` or `blocked`
- **THEN** its tasks.md line stays at `- [ ]`

### Requirement: steps.json staleness check
Before executing, the skill SHALL check whether `steps.json` is stale. It is stale when `openspec status --json --change <id>` artifact statuses differ from the `plan_artifacts` snapshot recorded at generation time. Stale state means asking the user whether to regenerate.

#### Scenario: artifact statuses diverge from snapshot
- **WHEN** the artifact statuses from `openspec status` differ from the `plan_artifacts` snapshot in steps.json
- **THEN** the skill asks the user whether to regenerate steps.json via `dod-guard steps`

#### Scenario: steps.json is fresh
- **WHEN** artifact statuses match the `plan_artifacts` snapshot
- **THEN** the skill resumes from the first `pending` step without regenerating

#### Scenario: steps.json is missing
- **WHEN** no steps.json exists for the change
- **THEN** the skill generates it with `dod-guard steps`

### Requirement: closing integration check and coverage
After all steps pass, the skill SHALL run the full build and test suite. On a green result it SHALL run `dod-guard cover` on the change. It SHALL run `openspec archive` when `dod-guard cover` exits 0.

#### Scenario: cover shows regression after all steps pass
- **WHEN** all individual steps pass but `dod-guard cover` reports a scenario regression
- **THEN** the skill does not archive and reports the regression to the user

#### Scenario: cover passes and archive runs automatically
- **WHEN** `dod-guard cover` exits 0 after all steps pass
- **THEN** the skill runs `openspec archive --yes` without asking the user

#### Scenario: integration check fails
- **WHEN** the full build and test suite fails after all steps complete
- **THEN** the skill reports the failure and does not run `dod-guard cover`

### Requirement: manual steps hold for user confirmation
Steps with `manual_required: true` and an empty `verify_cmd` SHALL remain at `pending` status until the user explicitly confirms them. The skill SHALL present the step description and wait.

#### Scenario: manual step presented to user
- **WHEN** the skill reaches a step with `manual_required: true`
- **THEN** it presents the step description and does not advance until the user confirms

#### Scenario: user confirms manual step
- **WHEN** the user explicitly confirms a `manual_required` step
- **THEN** the skill marks it `completed` and advances to the next step

#### Scenario: only the user can skip a step
- **WHEN** the orchestrator determines a step cannot be verified automatically
- **THEN** it holds the step at `pending` rather than skipping on the user's behalf
