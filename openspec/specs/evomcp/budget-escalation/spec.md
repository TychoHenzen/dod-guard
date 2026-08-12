# Budget Escalation Specification

## Purpose

Defines what a solve or evolve run may spend, and what happens when it gets
stuck. Budgets cap token and wall-time spend per playbook stage and warn as a
stage approaches its cap. The escalation ladder is the graduated response
when an attempt keeps failing: it changes strategy in fixed steps rather than
retrying forever.

## Requirements

### Requirement: Every playbook stage carries a token and time budget

The system SHALL track a token limit and a wall-time limit in milliseconds.
It SHALL track both for each of six stages: spec, test_author, implement,
harden, review, and merge. It SHALL also track both limits for a total
stage covering the whole run.

A caller SHALL be able to override the limit for one or more stages,
without affecting the others.

#### Scenario: Fresh budget state
- **WHEN** a new budget state is created with no overrides
- **THEN** every stage holds its default token limit and time limit. Every
  stage's consumption starts at zero tokens, zero milliseconds, zero attempts,
  and zero verified edges

#### Scenario: Overriding one stage
- **WHEN** a caller creates a budget state with an override for the implement
  stage's token limit
- **THEN** the implement stage uses the overridden limit and every other
  stage keeps its default limit

### Requirement: Consumption is recorded per stage and rolled into a total

The system SHALL let a caller record tokens, wall time, or a combined attempt
(tokens and time together) against a named stage. Each recording SHALL add to
that stage's consumption and to the total stage's consumption in the same
call.

#### Scenario: Recording tokens against one stage
- **WHEN** a caller records tokens against the spec stage
- **THEN** the spec stage consumes that many more tokens, and the total stage
  consumes the same amount

#### Scenario: Recording an attempt
- **WHEN** a caller records an attempt against a stage with a token count and
  a time count
- **THEN** the stage's tokens, time, and attempt count all increase. The
  total stage's tokens, time, and attempt count all increase to match

### Requirement: A stage is exhausted when either resource reaches its limit

The system SHALL treat a stage as exhausted once its token consumption
reaches its token limit or its time consumption reaches its time limit.
Whichever happens first decides the exhaustion. The fraction consumed for a
stage SHALL be the larger of its token fraction and its time fraction.

#### Scenario: Token limit reached
- **WHEN** a stage's token consumption reaches its token limit while its time
  consumption stays under its time limit
- **THEN** the system reports that stage as exhausted

#### Scenario: Fraction consumed picks the binding resource
- **WHEN** a stage has consumed a larger fraction of its time limit than of
  its token limit
- **THEN** the reported fraction consumed for that stage equals the time
  fraction

### Requirement: A run is exhausted only at the total stage, not a substage

The system SHALL treat the whole run as exhausted only when the total stage
reaches the total token limit or the total time limit. Exhaustion of one
substage SHALL NOT by itself mark the run exhausted.

#### Scenario: One substage exhausted, total still under limit
- **WHEN** a substage's consumption reaches its own limit but the total stage
  stays under the total limit
- **THEN** the run-level exhausted flag stays false

#### Scenario: Total limit reached
- **WHEN** the total stage's tokens or time reach the total limit
- **THEN** the run-level exhausted flag becomes true

### Requirement: Warnings fire once per stage at each of four thresholds

The system SHALL emit a warning the first time a stage's fraction consumed
reaches 50%, 80%, 95%, or 100%. Each threshold SHALL fire at most once per
stage. A warning SHALL name which resource drove the stage past the
threshold: tokens, time, or both.

#### Scenario: Crossing multiple thresholds in one recording
- **WHEN** a single recording pushes a stage's fraction consumed from under
  50% to over 95%
- **THEN** the system emits exactly one warning, for the 95% threshold, not
  one for every threshold it passed through

#### Scenario: Threshold already warned
- **WHEN** a stage sits at exactly its 50% threshold and a further recording
  keeps it at 50% or below
- **THEN** the system emits no second 50% warning for that stage

#### Scenario: Both resources cross the same threshold together
- **WHEN** a stage's token fraction and time fraction both reach a threshold
  at the same recording
- **THEN** the warning names the resource as both

### Requirement: A budget stops retries, not first attempts

The system SHALL let a first attempt at a stage proceed regardless of
remaining budget. Budget exhaustion SHALL only prevent further retries within
that stage or trigger escalation, never block the attempt already under way
or a stage's first attempt.

#### Scenario: Budget already exhausted before a first attempt
- **WHEN** a stage's budget is already exhausted and no attempt has yet been
  made at that stage
- **THEN** the system does not use budget exhaustion to refuse that first
  attempt

### Requirement: Cost per verified graph edge is the primary spend metric

The system SHALL compute a total dollar cost from total token consumption.
The system SHALL compute cost per verified edge as total cost divided by the
total count of verified graph edges. The system SHALL report no such figure
until at least one edge has been verified.

#### Scenario: No edges verified yet
- **WHEN** a run has consumed tokens but verified no graph edges
- **THEN** the cost-per-verified-edge figure is absent rather than a
  division-by-zero value

#### Scenario: A second edge lowers the per-edge cost
- **WHEN** a run verifies a second graph edge without further token spend
- **THEN** the reported cost per verified edge decreases, because the same
  total cost is now divided across more edges

### Requirement: A human-readable summary reports spend, edges, and exhaustion

The system SHALL produce a text summary that names each stage's consumption
and fraction of budget used. It SHALL also name the total tokens spent and
the total verified edges. The summary SHALL include the cost per verified edge when
available. It SHALL include an explicit exhaustion notice when the run is
exhausted.

#### Scenario: Summary while under budget
- **WHEN** a summary is requested for a run that has spent tokens but is not
  exhausted
- **THEN** the summary lists every stage's token count and edge count and
  carries no exhaustion notice

#### Scenario: Summary once exhausted
- **WHEN** a summary is requested for a run whose total stage has reached its
  limit
- **THEN** the summary carries an explicit exhaustion notice

### Requirement: The escalation ladder holds five rungs in a fixed order

The system SHALL define the rungs retry, resample, re-decompose,
stronger-model, and human, in that order, as the code-level escalation
ladder. A fresh escalation state SHALL start at the retry rung with zero
attempts and empty history.

This is the ladder implemented in code. It is distinct from, and shorter
than, the four-rung ladder the cascade skill describes above evomcp (worker
repair, worker resample, host model, user). The skill ladder's rungs are
decisions the orchestrating session and the user make around a run. The code
ladder's rungs are the strategy changes evomcp itself applies inside one
run.

#### Scenario: Fresh escalation state
- **WHEN** a new escalation state is created
- **THEN** its current rung is retry, its attempt count is zero, and its
  history is empty

#### Scenario: Full ladder in order
- **WHEN** a run escalates every time it exhausts a rung's attempts
- **THEN** it moves from retry to resample, from resample to re-decompose,
  from re-decompose to stronger-model, and from stronger-model to human. It
  never skips or reorders a rung

### Requirement: Each rung carries its own attempt budget

The system SHALL cap attempts at each rung independently: retry at 3,
resample at 5, re-decompose at 2, stronger-model at 1, and human at 1.
Reaching a rung's attempt cap with no other trigger firing SHALL still
escalate to the next rung.

#### Scenario: Retry rung exhausts its attempt cap
- **WHEN** three attempts have been recorded at the retry rung and no other
  trigger fires
- **THEN** the system escalates to the resample rung

#### Scenario: Escalating resets the attempt count at the new rung
- **WHEN** the system escalates from one rung to the next
- **THEN** the new rung's attempt count starts at zero

### Requirement: Five trigger signals can force escalation before the attempt cap

The system SHALL escalate a non-human rung immediately when any of these
signals fires. The same failure repeats across consecutive attempts, or
scores oscillate, or progress stalls (edit distance collapses to zero
across retries). It also fires when the token budget runs out, or the
wall-time budget runs out.

Any one of these signals SHALL be sufficient. The rung's attempt cap need
not be reached.

#### Scenario: A single stuck signal escalates immediately
- **WHEN** the stuck signal fires on the first attempt at a rung
- **THEN** the system escalates to the next rung without waiting for further
  attempts

#### Scenario: No signal and under the attempt cap
- **WHEN** no trigger signal fires and the rung's attempt count is under its
  cap
- **THEN** the system continues at the current rung

### Requirement: The human rung has nowhere higher to escalate to

The system SHALL treat the human rung as the ladder's end. While at the human
rung, a stuck signal or a budget-exhaustion signal SHALL abort the run rather
than escalate further. With no such signal, the system SHALL continue waiting
at the human rung.

#### Scenario: Human rung with a stuck signal
- **WHEN** the run is at the human rung and the stuck signal fires
- **THEN** the system aborts the run because no higher rung exists

#### Scenario: Human rung with no trigger
- **WHEN** the run is at the human rung and no trigger signal fires
- **THEN** the system continues at the human rung, waiting for resolution

### Requirement: A stuck determination composes at least two trigger signals

The system SHALL treat a task as stuck, for a composite stuck check, only
when at least two of the five trigger signals fire together. A
single firing signal SHALL NOT by itself satisfy this composite check.

#### Scenario: Two signals fire together
- **WHEN** both the oscillating signal and the no-progress signal fire on the
  same evaluation
- **THEN** the composite stuck check returns true

#### Scenario: Only one signal fires
- **WHEN** only the budget-exhausted signal fires
- **THEN** the composite stuck check returns false

### Requirement: A successful re-decomposition can return the ladder to retry

The system SHALL let a caller reset the current rung to retry, with the
attempt count at that rung set to zero. Total attempts and history SHALL
be preserved.

This SHALL be available independently of the automatic escalation trigger.
A successful decomposition can then resume at the bottom of the ladder.

#### Scenario: Resetting after re-decompose succeeds
- **WHEN** the run is at the re-decompose rung and decomposition succeeds
- **THEN** resetting the ladder returns the current rung to retry with zero
  attempts at that rung, while total attempts and history stay unchanged
