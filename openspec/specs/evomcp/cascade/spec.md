# evomcp/cascade Specification

## Purpose
Skill that orchestrates cheap-model fanout with verified selection, escalating stuck sub-problems through a 4-rung ladder. The skill writes the spec, dispatches solve/evolve/orchestrate tools, reviews winners, and classifies escalations.

## Requirements

### Requirement: 4 pre-dispatch checks
Before dispatching any evomcp tool, the skill SHALL verify four conditions. The evomcp server is connected via the `status` tool. The verify command discriminates (fails on a deliberately broken change and gives usable output on the current state). The task is decomposed to one concern per `solve` call. The `spec-writer` agent confirms the goal is unambiguous. Failing any check blocks dispatch.

#### Scenario: ambiguous goal detected
- **WHEN** the `spec-writer` agent identifies an ambiguous requirement in the spec
- **THEN** the skill presents the ambiguity to the user (U1 decision point) before dispatching

#### Scenario: evomcp status fails
- **WHEN** the status tool reports the backend is not running
- **THEN** the skill stops the dispatch and reports the failure

#### Scenario: verify command does not discriminate
- **WHEN** the verify command exits 0 on a deliberately broken change
- **THEN** the skill blocks dispatch until the verify command is fixed

#### Scenario: gitevo checkpoint taken before dispatch
- **WHEN** all four checks pass
- **THEN** the skill takes a gitevo checkpoint labelled pre-solve before dispatching

### Requirement: tool selection by problem shape
The skill SHALL select the evomcp tool based on problem shape. `solve` handles binary-fitness problems where verification either passes or fails. `evolve` handles scalar-fitness problems where improvement is measurable. `orchestrate` handles multi-step problems that walk SPEC through MERGE in order.

#### Scenario: binary fitness selects solve
- **WHEN** the verification is a test that either passes or fails
- **THEN** the skill dispatches the `solve` tool

#### Scenario: scalar fitness selects evolve
- **WHEN** the goal is to minimize response time or maximize a score
- **THEN** the skill dispatches the `evolve` tool

#### Scenario: multi-step problem selects orchestrate
- **WHEN** the task decomposes into sub-goals following the SPEC to MERGE sequence
- **THEN** the skill dispatches the `orchestrate` tool

### Requirement: winner review before acceptance
Every winning diff from solve or evolve SHALL be reviewed by the `patch-reviewer` agent before acceptance. The reviewer checks for correctness, degenerate patterns, scope creep, and re-runs the verify command. A rejected winner triggers a retry, not acceptance.

#### Scenario: reviewer rejects degenerate patch
- **WHEN** the winning diff hardcodes a test expectation to pass verification
- **THEN** the patch-reviewer rejects it and the skill retries with a more specific spec

#### Scenario: reviewer accepts clean patch
- **WHEN** the patch shows no degenerate patterns and stays within allowed_files
- **THEN** the patch-reviewer accepts it and the skill applies it

#### Scenario: patch touches files outside allowed_files
- **WHEN** the winning diff modifies a file not in allowed_files
- **THEN** the skill raises a U2 decision point and asks the user

### Requirement: escalation classification
When a solve or evolve run returns stuck, the skill SHALL dispatch `escalation-handler` to classify the stuck node. The classification is either a capability gap (the worker model cannot solve it) or an authority gap (the worker needs a decision it cannot make). Capability gaps escalate up the rung ladder. Authority gaps go straight to the user.

#### Scenario: authority gap returns to user
- **WHEN** the escalation handler classifies a stuck node as an authority gap
- **THEN** the skill presents the decision to the user and waits

#### Scenario: capability gap climbs the ladder
- **WHEN** the escalation handler classifies a stuck node as a capability gap
- **THEN** the skill escalates to the next rung without involving the user

### Requirement: 4-rung escalation ladder
The skill SHALL escalate through 4 rungs numbered 0 to 3. Rung 0 is the worker repair loop inside evomcp. Rung 1 is the worker resample inside evomcp. Rung 2 is the host model solving only the stuck node. Rung 3 is the user, asked through AskUserQuestion. Each rung is tried once before advancing.

#### Scenario: rung 2 host model solves the stuck node
- **WHEN** rungs 0 and 1 both fail and the escalation is a capability gap
- **THEN** the host model solves only the stuck node, not the whole task

#### Scenario: rung 0 worker repair resolves
- **WHEN** the worker's repair loop fixes the failure
- **THEN** the problem does not escalate further

#### Scenario: rung 3 returns problem to user
- **WHEN** rungs 0, 1, and 2 all fail
- **THEN** the skill asks the user via AskUserQuestion

### Requirement: 6 user decision points
The skill SHALL pause for user input at 6 defined points. U1 fires on an ambiguous spec before any fanout budget is spent. U2 fires on a suspected degenerate pattern or a file outside allowed_files. U3 fires on an ambiguous escalation diagnosis. U4 fires when host-model spend on one stuck node approaches 50K tokens. U5 fires on the third escalation of the same task. U6 fires before deleting user-written code or changing a public interface.

#### Scenario: budget exceeded on one stuck node
- **WHEN** host-model spend on one stuck node approaches 50K tokens
- **THEN** the skill pauses at U4 and asks the user whether to continue or stop

#### Scenario: ambiguous spec triggers U1
- **WHEN** the goal admits two or more materially different verify commands
- **THEN** the skill pauses at U1 before any fanout budget is spent

#### Scenario: third escalation triggers U5
- **WHEN** the same task escalates for the third time
- **THEN** the skill stops at U5 and asks the user before another attempt

#### Scenario: scope-changing action triggers U6
- **WHEN** applying the patch would delete user-written code or change a public interface
- **THEN** the skill pauses at U6 with impact radius evidence attached

### Requirement: session state persistence
The skill SHALL persist cascade state in session files so work survives interruption. The state includes which sub-problems are solved, which are stuck, the current escalation rung, and the winning diffs accepted so far.

#### Scenario: session resume after interruption
- **WHEN** a cascade session is interrupted and resumed
- **THEN** the skill reads the persisted state and continues from the last checkpoint

#### Scenario: pending decision resumed
- **WHEN** a pending-decision.json file exists on session start
- **THEN** the skill asks that question first before planning new work

#### Scenario: recorded decision not re-asked
- **WHEN** a decision point was already resolved and recorded in decisions.json
- **THEN** the skill reads the recorded answer instead of asking again
