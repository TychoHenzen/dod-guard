# Evolve Specification

## Purpose

Defines population-based evolution against a scalar fitness command, for
optimization work where a result is better or worse rather than pass or fail.
A run measures a numeric baseline, mutates a population of candidates across
generations, and keeps the best-scoring lineage found. Budget warnings and the
escalation ladder belong to `evomcp/budget-escalation`. The metric-gaming
detectors belong to `evomcp/candidate-screening`. Subprocess spawning belongs
to `evomcp/worker-dispatch`.

## Requirements

### Requirement: A run measures baseline fitness before mutating anything

The system SHALL run the fitness command against the working tree before any
generation starts, and SHALL parse a numeric score from its output. A fitness
command whose output holds no numeric score SHALL fail the run before any
mutation is attempted.

#### Scenario: Fitness command emits a number
- **WHEN** the fitness command's stdout holds a numeric score
- **THEN** the run records that score as the baseline and proceeds

#### Scenario: Fitness command emits no number
- **WHEN** the fitness command's stdout holds no numeric score
- **THEN** the run throws an error naming the command and its output, and no
  generation runs

### Requirement: Optional lint, build and test gates run before the baseline

When the spec configures a lint, build or test command, the system SHALL run
those gates against the working tree before or alongside baseline measurement.
A baseline that fails its gates SHALL still let the run proceed, with a
warning that the starting point does not pass its own gates. A spec with none
of those commands configured SHALL skip gating entirely and treat it as
trivially passed.

#### Scenario: No gate commands configured
- **WHEN** the spec sets no lint, build or test command
- **THEN** the run treats gating as passed and runs no gate command

#### Scenario: Baseline fails its gates
- **WHEN** a lint, build or test command is configured and fails against the
  starting working tree
- **THEN** the run emits a warning and still proceeds to read target files

### Requirement: Target files are read through glob patterns

The system SHALL read the files named by the spec's target-file patterns,
resolving a pattern that names a file directly and a pattern that names a
directory glob. A run whose patterns match no file SHALL fail before any
generation starts. The target-file list a caller supplies is understood to be
filtered to files the caller is allowed to touch; that filtering is a
dispatch-level concern, not a check evolve performs on the patterns itself.

#### Scenario: Pattern names an existing file
- **WHEN** a target-file pattern resolves to a path that exists and is a file
- **THEN** the run reads that file's contents into the population's source
  material

#### Scenario: Pattern names a directory glob
- **WHEN** a target-file pattern holds a wildcard against files in a directory
- **THEN** every file in that directory matching the wildcard is read

#### Scenario: No pattern matches anything
- **WHEN** none of the spec's target-file patterns match a file on disk
- **THEN** the run throws an error naming the patterns, and no generation runs

### Requirement: Each generation mutates a population under a concurrency cap

For each generation, the system SHALL spawn one mutation attempt per
population member, and SHALL run at most four mutation attempts at once
regardless of population size. A population larger than four SHALL queue the
remainder until a slot frees.

#### Scenario: Population larger than the concurrency cap
- **WHEN** a generation's population size is 8
- **THEN** at most 4 mutation attempts run at the same time, and every member
  still gets a turn

#### Scenario: Population at or below the concurrency cap
- **WHEN** a generation's population size is 4 or fewer
- **THEN** every member's mutation attempt can run at once

### Requirement: Each candidate is scored and gated before it can become best

The system SHALL run the fitness command against a candidate that produced a
committed change, and SHALL run the same lint, build and test gates configured
for the baseline before that candidate can replace the current best. A
candidate whose score would be better than the current best but which fails a
configured gate SHALL NOT become the new best and SHALL NOT be adopted.

#### Scenario: Winning score but failing gate
- **WHEN** a candidate's fitness score is better than the current best but a
  configured gate fails for it
- **THEN** the run does not record that candidate as the new best and reports
  the prior best unchanged for that generation

#### Scenario: Winning score with passing gates
- **WHEN** a candidate's fitness score is better than the current best and
  every configured gate passes
- **THEN** the run records that candidate's score and branch as the new best

#### Scenario: Candidate produces no change
- **WHEN** a mutation attempt produces no committed change to the working tree
- **THEN** that candidate is abandoned and never scored

### Requirement: Elite selection tracks the best-scoring candidates seen

Each time a candidate becomes the new best, the system SHALL record it among a
bounded set of elites, ordered so the best-scoring elite sorts first, whether
higher or lower is better. The set SHALL be capped so only a handful of the
best-scoring elites are kept.

#### Scenario: New best displaces the weakest recorded elite
- **WHEN** a new best candidate is found and the elite set is already at its
  cap
- **THEN** the elite set still holds only its capped size afterward, ordered
  best first

### Requirement: The best patch so far carries forward between generations

Between generations, the system SHALL check out the current best-scoring
branch found so far, so the next generation's mutations build on it rather
than restarting from the baseline. When no candidate in a generation improved
on the best, the system SHALL return the working tree to the run's root
branch before the next generation's checkpoint.

#### Scenario: A generation improves on the best
- **WHEN** a generation produces a new best-scoring candidate
- **THEN** the next generation's mutations start from that candidate's branch

#### Scenario: A generation improves on nothing
- **WHEN** no candidate in a generation beats the current best
- **THEN** the working tree returns to the root branch before the next
  generation begins

### Requirement: Token spending is tracked per candidate and accumulated

The system SHALL measure the token delta for each candidate's mutation
attempt and add it to a running total across the run, regardless of whether
that candidate went on to win, lose, error, or fail its gates.

#### Scenario: A losing candidate still consumes tokens
- **WHEN** a candidate's mutation attempt runs but the candidate does not
  become the new best
- **THEN** its token delta is still added to the run's accumulated total

### Requirement: The run stops early on convergence, stagnation or oscillation

After each generation, the system SHALL evaluate the generation's scores and
fitness history for convergence, stagnation and oscillation, and SHALL stop
the generation loop before its configured limit when that evaluation
recommends anything other than continuing. The stopping reason SHALL be
carried into the run's result.

#### Scenario: Convergence detected before the generation limit
- **WHEN** the convergence check recommends stopping after generation 1 of a
  5-generation run
- **THEN** the loop stops after generation 1, and the result reports the
  convergence reason and the best score found so far

#### Scenario: Convergence never triggers
- **WHEN** every generation's convergence check recommends continuing
- **THEN** the loop runs for the full configured number of generations

### Requirement: The run verifies the final state with the best patch applied

At the end of the run, the system SHALL attempt to adopt the best-scoring
branch into the working tree. When adoption fails, the system SHALL still
report that branch as the winning patch rather than discarding the result.
The system SHALL then run the fitness command once more, and SHALL run any
configured lint, build or test gates once more, against the adopted state, and
SHALL report the baseline score, the final score, and the improvement between
them.

#### Scenario: Adoption succeeds
- **WHEN** the best-scoring branch adopts cleanly
- **THEN** the final fitness measurement runs against the adopted working tree

#### Scenario: Adoption fails
- **WHEN** adopting the best-scoring branch throws an error
- **THEN** the run still reports that branch's name as the winning patch,
  rather than falling back to reporting no improvement

#### Scenario: No candidate ever improved on the baseline
- **WHEN** no generation ever produces a candidate that beats the baseline
- **THEN** the run reports no winning patch and its final score equals the
  baseline score
