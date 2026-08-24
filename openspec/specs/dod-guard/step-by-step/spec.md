# dod-guard/step-by-step Specification

## Purpose
Executes a confirmed multi-step plan in ordered task chunks. Each fresh worker receives about 50,000 to 100,000 estimated execution tokens of work. The orchestrator preserves task-level scope and verification, then persists progress directly in `tasks.md` so interrupted sessions can resume.
## Requirements
### Requirement: token-sized sequential worker chunks
The skill SHALL estimate each pending task's execution cost and group contiguous tasks into worker chunks targeting 50,000 to 100,000 tokens. It SHALL aim near 75,000 tokens when several valid splits exist. It SHALL NOT dispatch a fresh worker for every small task. Each chunk SHALL use a fresh worker that has not handled an earlier chunk. The skill SHALL stop every agent used for the resolved chunk before dispatching the next chunk. Chunks and tasks within each chunk SHALL execute in dependency order as defined in `tasks.md`.

#### Scenario: dependent step waits
- **WHEN** a later step depends on an earlier step that is not yet completed
- **THEN** the skill places them in dependency order and does not execute the later step first

#### Scenario: all dependencies satisfied
- **WHEN** every step in a step's `deps` array shows `completed`
- **THEN** the skill may include that step in the next eligible chunk

#### Scenario: independent steps follow array order
- **WHEN** two steps have no dependency on each other
- **THEN** the skill keeps their source order within or across chunks

#### Scenario: many tiny tasks share one worker
- **WHEN** contiguous small tasks have a combined estimate between 50,000 and 100,000 tokens
- **THEN** the skill dispatches them together to one fresh worker

#### Scenario: resolved chunk releases its agents
- **WHEN** a chunk and any same-chunk repair work are resolved
- **THEN** the skill stops every agent used for that chunk before dispatching another chunk

#### Scenario: next chunk gets clean context
- **WHEN** another chunk is ready after the current chunk is resolved
- **THEN** the skill spawns a fresh agent and does not send the chunk to an earlier agent through a follow-up

#### Scenario: task type changes inside a chunk
- **WHEN** an ordinary task is followed by a TDD or debugging task and their combined estimate remains within the target
- **THEN** the skill keeps them in one mixed chunk rather than paying for another fresh worker

#### Scenario: final tail is below target
- **WHEN** the remaining compatible tasks total less than 50,000 tokens and cannot join the preceding chunk without exceeding 100,000 tokens
- **THEN** the skill dispatches one smaller final chunk

#### Scenario: one task exceeds the target
- **WHEN** one task alone is estimated above 100,000 tokens
- **THEN** the skill dispatches that task alone rather than combining it with more work

### Requirement: worker dispatch by chunk type
The skill SHALL send ordinary or mixed chunks to `step-implementer`, with a per-task mode selecting ordinary, TDD, or debugging behavior. Homogeneous TDD chunks go to `step-tdd-implementer`. Homogeneous symptom chunks go to `step-debugger`. Compile, type, or import repairs go to `step-build-fixer`. The orchestrator SHALL NOT implement tasks itself.

#### Scenario: TDD tasks dispatch to TDD implementer
- **WHEN** contiguous tasks carry a `tdd` predicate or a red-first requirement
- **THEN** the skill groups them within the token target and dispatches the chunk to `step-tdd-implementer`

#### Scenario: ordinary changes dispatch to step-implementer
- **WHEN** contiguous tasks describe plain implementation changes with no special predicate
- **THEN** the skill groups them within the token target and dispatches the chunk to `step-implementer` at sonnet tier

#### Scenario: mixed changes dispatch to step-implementer
- **WHEN** a token-sized chunk contains more than one task type
- **THEN** the skill dispatches the chunk to `step-implementer` with each task's execution mode instead of splitting the chunk

#### Scenario: compile error dispatches to build-fixer
- **WHEN** a step describes a compiler, type, or import failure
- **THEN** the skill dispatches it to `step-build-fixer` at haiku tier

#### Scenario: worker returns AMBIGUOUS
- **WHEN** a worker returns AMBIGUOUS with multiple interpretations
- **THEN** the skill resolves in-scope ambiguity or surfaces the question, then resumes the same chunk worker when the runtime supports it

### Requirement: verification after every step
After a chunk worker returns, each task with a resolved `verify_cmd` SHALL have that command run by the orchestrator in source order. A verified task passes when its `verify_cmd` exits 0. A task without a resolved command is unverified, not manual. The orchestrator verifies independently rather than trusting the worker's claim when a command exists.

#### Scenario: worker claims success but verify_cmd fails
- **WHEN** the worker reports success but the step's verify_cmd exits non-zero
- **THEN** the skill marks the step as failed and enters the repair cycle

#### Scenario: every task gate passes and chunk gets committed
- **WHEN** every resolved `verify_cmd` in a chunk exits 0 and every unverified task reports DONE
- **THEN** the skill marks those tasks completed and commits the chunk's changes as one rollback point

#### Scenario: one task gate fails
- **WHEN** any task's independent `verify_cmd` fails after the chunk worker returns
- **THEN** the skill repairs that task within its repair budget and does not commit or complete the chunk until every task gate passes

#### Scenario: structural surface requires diff reading
- **WHEN** a step's verify_surface is `structural`
- **THEN** the skill reads the diff to confirm changes stayed within the step's files list

### Requirement: bounded repair budget
Each failed task SHALL have a repair budget of two attempts. When both fail, the skill SHALL pivot once by rewriting the task description to name the failed approach. Two more attempts run under the new description. When the second pair also fails, the skill SHALL mark the task blocked, leave its chunk uncommitted, and stop. No third pivot is allowed.

#### Scenario: repair budget exhausted
- **WHEN** a step fails verification twice under its original description and twice more after a pivot
- **THEN** the skill marks the step as blocked, stops the session, and reports what was tried

#### Scenario: second attempt succeeds without pivot
- **WHEN** the first repair attempt fails but the second passes verification
- **THEN** the step is marked completed without a pivot

#### Scenario: pivot succeeds after original description fails
- **WHEN** both attempts under the original description fail and the first attempt under the rewritten description passes
- **THEN** the step is marked completed

### Requirement: steps.json staleness check
Before executing, the skill SHALL check whether the change's artifact statuses from `openspec status --json` have changed since the last run. It SHALL store the snapshot as a `<!-- plan_artifacts: ... -->` comment at the top of `tasks.md`. Divergence means asking the user whether to re-resolve verify_cmds.

When `tasks.md` does not exist, the skill SHALL route to `/dod-guard:interview` or `/opsx:propose`.

#### Scenario: artifact statuses diverge from snapshot
- **WHEN** the artifact statuses from `openspec status` differ from the `<!-- plan_artifacts: ... -->` snapshot in tasks.md
- **THEN** the skill asks the user whether to re-resolve verify_cmds

#### Scenario: steps.json is fresh
- **WHEN** artifact statuses match the snapshot
- **THEN** the skill resumes from the first uncompleted task without re-resolving

#### Scenario: steps.json is missing
- **WHEN** no tasks.md exists for the change
- **THEN** the skill routes to `/dod-guard:interview` or `/opsx:propose` and does not proceed

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

### Requirement: plan approval authorizes unverified steps
The skill SHALL execute every step after plan approval, including steps with `manual_required: true` or an empty `verify_cmd`. It SHALL record those steps as unverified after the worker returns `DONE`. It SHALL NOT request another permission solely because automated verification is unavailable.

#### Scenario: manual-required step does not request permission
- **WHEN** a step has `manual_required: true` and no resolved `verify_cmd`
- **THEN** the skill executes it under the existing plan approval, records the step as unverified, and does not ask the user for another permission
