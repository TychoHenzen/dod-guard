# Evomcp Orchestration Specification

## Purpose

Defines the playbook state machine that walks one piece of work from spec to
merge. The orchestrator enforces stage order and per-stage gates; it does not
implement the stages itself. Budget and escalation policy belong to the
sibling spec `evomcp/budget-escalation` and are named here only at the seam.

## Requirements

### Requirement: Playbook stages run in a fixed sequence

The orchestrator SHALL walk exactly six stages in this order: SPEC,
TEST_AUTHOR, IMPLEMENT, HARDEN, REVIEW, MERGE. A fresh run SHALL start with no
current stage, and the first advance SHALL enter SPEC.

#### Scenario: Fresh run advances into SPEC
- **WHEN** a new orchestrator run advances for the first time
- **THEN** the current stage becomes SPEC and the gate reports it enterable

#### Scenario: Stages advance in fixed order
- **WHEN** each stage completes in turn from a fresh run
- **THEN** the orchestrator enters TEST_AUTHOR, then IMPLEMENT, then HARDEN,
  then REVIEW, then MERGE, in that order and no other

#### Scenario: Run completes after MERGE
- **WHEN** MERGE completes and the orchestrator advances again
- **THEN** there is no next stage and the run is marked completed

### Requirement: Each stage gates entry on the prior stage's completion flag

The orchestrator SHALL block entry to a stage until the flag(s) that stage
depends on are set. SPEC SHALL have no entry prerequisite. TEST_AUTHOR SHALL
require the spec-locked flag. IMPLEMENT SHALL require both a tests-locked flag
and a tests-red flag. HARDEN SHALL require an implement-pass flag. REVIEW
SHALL require a harden-pass flag. MERGE SHALL require a review-pass flag. A
blocked stage SHALL carry a reason describing what is missing.

#### Scenario: SPEC has no prerequisite
- **WHEN** a fresh orchestrator checks the gate for SPEC
- **THEN** the gate reports SPEC enterable

#### Scenario: TEST_AUTHOR blocked without a locked spec
- **WHEN** the orchestrator checks the gate for TEST_AUTHOR before the spec
  has been locked
- **THEN** the gate reports TEST_AUTHOR not enterable and names the missing
  spec lock as the reason

#### Scenario: IMPLEMENT blocked without red, locked tests
- **WHEN** the orchestrator checks the gate for IMPLEMENT and either the
  tests-locked flag or the tests-red flag is missing
- **THEN** the gate reports IMPLEMENT not enterable

#### Scenario: IMPLEMENT enterable once tests are locked and red
- **WHEN** both the tests-locked flag and the tests-red flag are set
- **THEN** the gate reports IMPLEMENT enterable

#### Scenario: HARDEN, REVIEW, MERGE each require the prior pass flag
- **WHEN** the orchestrator checks the gate for HARDEN, REVIEW, or MERGE
  before the corresponding prior-stage pass flag is set
- **THEN** the gate reports that stage not enterable

### Requirement: Completing a stage sets its flag and records the attempt

Completing a stage SHALL set the flag(s) that later stages gate on, record the
attempt against that stage's budget, and record a success against the
escalation tracker. Completing SPEC SHALL set the spec-locked flag. Completing
TEST_AUTHOR SHALL set both the tests-locked flag and the tests-red flag.
Completing IMPLEMENT, HARDEN, and REVIEW SHALL each set that stage's pass
flag. Completing MERGE SHALL mark the run completed.

#### Scenario: Completing SPEC unlocks TEST_AUTHOR
- **WHEN** SPEC completes
- **THEN** the spec-locked flag is set and the gate for TEST_AUTHOR reports
  enterable

#### Scenario: Completing MERGE marks the run done
- **WHEN** MERGE completes
- **THEN** the run's completed flag is set

### Requirement: SPEC, TEST_AUTHOR, and REVIEW stop for a human by default

Driving a playbook run SHALL treat SPEC, TEST_AUTHOR, and REVIEW as human
gates: each SHALL report a human-gate status and a message asking for
confirmation, then complete without further automated check. HARDEN SHALL
also stop for a human when the caller supplies no mutation command; when a
mutation command is supplied, HARDEN SHALL run it and gate on its exit code
instead.

#### Scenario: SPEC stops for confirmation
- **WHEN** a playbook run reaches SPEC
- **THEN** the run reports a human-gate status for SPEC and completes that
  stage without running an automated check

#### Scenario: TEST_AUTHOR stops for confirmation
- **WHEN** a playbook run reaches TEST_AUTHOR
- **THEN** the run reports a human-gate status for TEST_AUTHOR asking the
  caller to confirm the tests are red

#### Scenario: REVIEW stops for confirmation
- **WHEN** a playbook run reaches REVIEW
- **THEN** the run reports a human-gate status for REVIEW asking the caller to
  approve the patch

#### Scenario: HARDEN stops for a human with no mutation command
- **WHEN** a playbook run reaches HARDEN and the caller supplied no mutation
  command
- **THEN** the run reports a human-gate status for HARDEN instead of running
  an automated check

### Requirement: IMPLEMENT and HARDEN run an automated check when configured

IMPLEMENT SHALL always run an automated solve to produce a candidate patch.
HARDEN SHALL run the caller-supplied mutation command when one is given, and
gate on that command's exit code: a zero exit SHALL pass the stage, a nonzero
exit SHALL fail the stage.

#### Scenario: IMPLEMENT drives an automated solve
- **WHEN** a playbook run reaches IMPLEMENT
- **THEN** the run invokes the solve capability and records its outcome
  against the IMPLEMENT stage

#### Scenario: HARDEN passes on a zero mutation-command exit
- **WHEN** a mutation command is supplied and exits zero
- **THEN** HARDEN reports a passed status

#### Scenario: HARDEN fails on a nonzero mutation-command exit
- **WHEN** a mutation command is supplied and exits nonzero
- **THEN** HARDEN reports a failed status naming the exit code, and the run
  does not proceed past HARDEN

### Requirement: MERGE gates on held-out tests when supplied

MERGE SHALL run the caller-supplied held-out test command when one is given,
and gate on its exit code. A zero exit SHALL pass MERGE and complete the run.
A nonzero exit SHALL fail MERGE and abort the run, recording the exit code and
a slice of the command's output in the failure reason. When no held-out test
command is supplied, MERGE SHALL pass without running one.

#### Scenario: Held-out tests pass
- **WHEN** MERGE runs a supplied held-out test command that exits zero
- **THEN** MERGE reports a passed status and the run outcome is a pass

#### Scenario: Held-out tests fail
- **WHEN** MERGE runs a supplied held-out test command that exits nonzero
- **THEN** MERGE reports a failed status, the run is aborted, and the run
  outcome is an escalation rather than a pass

#### Scenario: No held-out tests supplied
- **WHEN** the caller supplies no held-out test command
- **THEN** MERGE reports a passed status without running any command

### Requirement: A failed stage gate stops the run rather than skipping ahead

When a stage cannot be entered because its gate blocks it, the orchestrator
SHALL NOT advance to a later stage. If the run is not already marked
completed, the run SHALL record a failed result for the blocked stage naming
the block reason and SHALL stop driving further stages.

#### Scenario: Blocked gate halts the run
- **WHEN** advancing the orchestrator finds a stage gate that blocks entry
- **THEN** the orchestrator reports no next stage, and if the run had not
  already completed, it records that stage's block reason as a failure and
  stops

### Requirement: A failed automated stage aborts the run

When IMPLEMENT's automated solve does not pass, the run SHALL abort rather
than retry the IMPLEMENT stage itself: the run SHALL be marked aborted with a
reason drawn from the solve outcome, and no later stage SHALL run. Escalation
policy for retries within a stage belongs to `evomcp/budget-escalation`.

#### Scenario: Solve failure aborts the run at IMPLEMENT
- **WHEN** the automated solve invoked by IMPLEMENT does not pass
- **THEN** the run marks IMPLEMENT as failed, aborts the run, and does not
  reach HARDEN

### Requirement: A run reports one outcome drawn from its final state

Driving a playbook run to completion SHALL report exactly one outcome: a pass
when the run completed through MERGE, an escalation when the run was aborted,
or incomplete otherwise. The run SHALL also report, per stage, the stage
name, its status, and the time spent in it.

#### Scenario: Completed run reports pass
- **WHEN** every stage completes through MERGE with no abort
- **THEN** the run outcome is a pass

#### Scenario: Aborted run reports escalate
- **WHEN** the run is aborted before completing MERGE
- **THEN** the run outcome is an escalation

#### Scenario: Every stage result carries timing
- **WHEN** a playbook run finishes, for any reason
- **THEN** each recorded stage result carries a status and the time spent in
  that stage

### Requirement: The playbook loader names a stage sequence and its hard gates

Loading a playbook by its type SHALL return the stage sequence that type runs
and the set of hard gates for it. Every playbook type the loader accepts
SHALL return a sequence that starts at SPEC and ends at MERGE.

#### Scenario: Every playbook type starts at SPEC and ends at MERGE
- **WHEN** the loader is asked for the bugfix, feature, refactor,
  test-harden, reconcile, or review playbook
- **THEN** each returned stage sequence is non-empty, starts with SPEC, and
  ends with MERGE

### Requirement: A run reports a human-readable status of the current state

The orchestrator SHALL be able to summarize its state as text naming the
current stage, whether the run completed or aborted, and the set of flags set
so far. A run with no flags SHALL report that plainly rather than an empty
list.

#### Scenario: Summary names the current stage
- **WHEN** the orchestrator's current stage is IMPLEMENT
- **THEN** the summary text names the Implementation stage

#### Scenario: Summary reports no flags plainly
- **WHEN** no stage has completed yet
- **THEN** the summary reports that no flags are set, rather than printing
  nothing
