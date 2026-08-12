# Solve Specification

## Purpose

Best-of-N solving with repair chains, for work whose fitness is binary: a
candidate either passes verification or it does not. `solve` spawns several
independent attempts at one goal, gives each a bounded repair loop, and
adopts at most one verified change. Plan deduplication, the degenerate and
allowed-files screens, and the judge rubric belong to
`evomcp/candidate-screening`. Budgets and the escalation ladder belong to
`evomcp/budget-escalation`. Subprocess spawning belongs to
`evomcp/worker-dispatch`.

## Requirements

### Requirement: A checkpoint gate runs before any attempt
The system SHALL create a restore point before starting any attempt. When the
checkpoint fails, the system SHALL abort the run without starting any attempt
and SHALL report zero lineages attempted.

#### Scenario: Checkpoint fails
- **WHEN** the restore point cannot be created
- **THEN** the run returns an escalation report with `failure_signature`
  `checkpoint_failed`, `lineages_attempted` of 0, an empty lineage
  diagnostics list, and zero candidates generated

#### Scenario: Checkpoint succeeds
- **WHEN** the restore point is created successfully
- **THEN** the run proceeds to sample and run attempts

### Requirement: Attempts run one at a time
The system SHALL run attempts sequentially rather than concurrently, because
every attempt checks out its own branch inside the one working directory the
run holds, and two attempts cannot each hold that directory checked out to a
different branch at once.

#### Scenario: Multiple plans sampled
- **WHEN** the run samples more than one plan
- **THEN** each plan is attempted to completion, including its repair loop
  and screening, before the next plan's attempt starts

### Requirement: Each attempt follows a fixed cycle
The system SHALL run each attempt through: spawning a branch from the
checkpoint, checking that branch out, running a worker against the plan's
prompt, committing whatever the worker produced, capturing the diff against
the root branch, and verifying the result.

#### Scenario: Branch cannot be spawned or checked out
- **WHEN** spawning or checking out an attempt's branch fails
- **THEN** the attempt is marked failed without a worker run and without
  verification

#### Scenario: Worker times out
- **WHEN** the worker does not finish inside its time limit
- **THEN** the attempt is marked timed out and skips verification

#### Scenario: Worker produces no output
- **WHEN** the worker exits without producing any output
- **THEN** the attempt is marked with a no-output diagnostic and skips
  verification

#### Scenario: Worker produces output
- **WHEN** the worker produces output
- **THEN** the system commits the working tree, captures the diff against
  the root branch, and verifies the result

### Requirement: Verification runs the gate pipeline when any gate is configured, otherwise the bare verify command
The system SHALL run the multi-phase gate pipeline (lint, build, test, then
verify) when the caller configured any of the lint, build, or test commands.
When none of those is configured, the system SHALL run the verify command
alone and judge the attempt on its exit code.

#### Scenario: No lint, build, or test command configured
- **WHEN** the caller supplied only a verify command
- **THEN** the system runs that command alone and treats a zero exit as
  passing

#### Scenario: A build or test command is configured
- **WHEN** the caller supplied a lint, build, or test command
- **THEN** the system runs the gate pipeline and treats the attempt as
  passing only when every configured gate passes

### Requirement: A failing attempt enters a bounded repair loop
The system SHALL give a failing attempt further worker tries, each with
feedback compiled from the failing verification output, until the
escalation ladder stops the lineage, the run's budget is exhausted, a repair
worker times out, or a repair attempt passes verification.

#### Scenario: Repair produces a passing result
- **WHEN** a repair try passes verification
- **THEN** the lineage stops repairing and the attempt is marked passed

#### Scenario: Repair times out
- **WHEN** a repair worker times out
- **THEN** the lineage stops repairing and the attempt is marked timed out

#### Scenario: Ladder leaves the retry and resample rungs
- **WHEN** the escalation ladder advances past the rungs that permit another
  try
- **THEN** the lineage stops repairing and the attempt is marked stuck

### Requirement: Stuck and oscillating detection reads per-lineage signature history
The system SHALL compute a failure signature for each repair try and
maintain a per-lineage history of those signatures. It SHALL classify the
lineage's failure mode as stuck when recent signatures repeat unchanged,
oscillating when a signature recurs after an intervening different one, or
no-progress when recent signatures are all distinct, and SHALL record that
classification on the attempt's diagnostic.

#### Scenario: Same signature repeats
- **WHEN** the most recent signatures in a lineage's history are identical
- **THEN** the lineage's failure mode is recorded as stuck

#### Scenario: Signature alternates between two values
- **WHEN** a lineage's most recent signature matches one two tries back but
  differs from the one immediately before it
- **THEN** the lineage's failure mode is recorded as oscillating

### Requirement: Every non-surviving attempt is abandoned
The system SHALL check out and abandon the branch of every attempt that does
not survive screening, reverting the branch and recording the reason the
lineage did not survive.

#### Scenario: Attempt fails verification or screening
- **WHEN** an attempt does not pass verification, or passes but is rejected
  by screening
- **THEN** its branch is checked out and abandoned with the attempt's final
  status and repair count as the reason

#### Scenario: Branch was never created
- **WHEN** an attempt's branch could not be checked out
- **THEN** the system does not attempt to abandon it further

### Requirement: A single survivor is adopted directly, several go through the judge
The system SHALL adopt a single surviving attempt without invoking the
judge. When more than one attempt survives, the system SHALL send them to
the judge for comparison and adopt the branch the judge selects. In either
case the system SHALL abandon every survivor that was not adopted before
returning to the root branch.

#### Scenario: Exactly one survivor
- **WHEN** exactly one attempt survives screening
- **THEN** that attempt is adopted without a judge verdict in the result

#### Scenario: Several survivors
- **WHEN** more than one attempt survives screening
- **THEN** the system compares them and adopts the one the judge selects,
  and the result carries the judge's verdict

#### Scenario: Losing survivors are abandoned
- **WHEN** a survivor is not the one adopted
- **THEN** its branch is abandoned with the winning branch named as the
  reason

### Requirement: A run with no surviving attempt returns an escalation report
The system SHALL return an escalation outcome when no attempt survives. The
report SHALL name the most frequent failure signature across every
attempt's history, carry the diff and truncated output of the least-bad
attempt, count how many lineages were attempted, and carry every attempt's
diagnostic.

#### Scenario: Every attempt fails
- **WHEN** no attempt survives verification and screening
- **THEN** the run returns outcome `escalate` with a summary naming the
  lineage count, the dominant failure signature, and the total repair tries,
  and lineage diagnostics for every attempt

#### Scenario: Some attempts were rejected by screening
- **WHEN** one or more passing attempts were rejected by screening and no
  attempt otherwise survives
- **THEN** the escalation summary and result also carry those rejection
  reasons
