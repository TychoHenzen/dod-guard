## Purpose

Reports which of a change's scenarios a real passing test exercises. It also
reports the scenarios whose only test bypasses the path a user takes. The
evidence comes from the repository's own test suite, not from an authored
shell command.

## ADDED Requirements

### Requirement: cover command exists

dod-guard SHALL provide `dod-guard cover <change-id>`. The command reads every
scenario in the named change and reports the coverage state of each one.

#### Scenario: Command reports every scenario in the change

- **WHEN** a user runs `dod-guard cover <change-id>` against a change with spec deltas
- **THEN** the output names every scenario in those deltas
- **AND** each scenario carries exactly one coverage state

#### Scenario: Unknown change id is a usage error

- **WHEN** a user runs `dod-guard cover` with an id that names no change
- **THEN** the command exits 3
- **AND** the message names the id it could not find

### Requirement: A scenario binds to named tests

A scenario SHALL declare the tests that exercise it by name. dod-guard MUST NOT
infer the binding from a substring match between the scenario title and a test
title.

#### Scenario: Declared test binds to the scenario

- **WHEN** a scenario declares a test by name and that test exists
- **THEN** dod-guard reports the scenario as bound to that test

#### Scenario: A scenario with no declared test is unbound

- **WHEN** a scenario declares no test
- **THEN** dod-guard reports it as unbound
- **AND** the report does not guess at a test that might cover it

#### Scenario: A declared test that does not exist is an error

- **WHEN** a scenario names a test that the suite does not contain
- **THEN** dod-guard reports the scenario as a broken binding
- **AND** names both the scenario and the missing test

### Requirement: Coverage requires a passing run

A bound scenario SHALL count as covered only when its tests ran and passed in
the run dod-guard reads. A test that exists but never ran does not cover
anything.

#### Scenario: Passing test covers its scenario

- **WHEN** every test bound to a scenario passed in the run being read
- **THEN** dod-guard reports the scenario as covered

#### Scenario: Failing test does not cover its scenario

- **WHEN** a test bound to a scenario failed in the run being read
- **THEN** dod-guard reports the scenario as not covered
- **AND** names the failing test

#### Scenario: Skipped test does not cover its scenario

- **WHEN** the only test bound to a scenario was skipped
- **THEN** dod-guard reports the scenario as not covered

### Requirement: Coverage requires reachability from an entry point

A covered scenario SHALL also show that its test reaches the implementation
through a declared user-facing entry point. A test that calls the
implementation directly proves the code runs, not that a user can reach it.

#### Scenario: Test through an entry point counts as integrated

- **WHEN** a passing test calls a declared entry point, and that call reaches the scenario's implementation
- **THEN** dod-guard reports the scenario as covered and integrated

#### Scenario: Test that bypasses every entry point is reported

- **WHEN** a passing test reaches the implementation without passing through any declared entry point
- **THEN** dod-guard reports the scenario as covered but not integrated
- **AND** names the test and the entry point that no test reaches

#### Scenario: Implementation no entry point reaches is reported

- **WHEN** no declared entry point reaches a scenario's implementation at all
- **THEN** dod-guard reports the scenario as unwired
- **AND** the report distinguishes unwired from covered but not integrated

### Requirement: A project declares its own entry points

A project SHALL declare the entry points that count as user-facing. dod-guard
MUST NOT assume a fixed set, because a command line tool, a server and a user
interface each expose different ones.

#### Scenario: Declared entry points drive the reachability walk

- **WHEN** a project declares its entry points
- **THEN** dod-guard walks from those entry points and no others

#### Scenario: A project with no declared entry points reports the gap

- **WHEN** a project declares no entry points
- **THEN** dod-guard reports every scenario as covered or not covered
- **AND** states plainly that it checked no integration, rather than passing them

### Requirement: cover reports and does not block

`dod-guard cover` SHALL exit 0 whenever it completed its reading, whatever it
found. No repository can satisfy this check on the day it lands, so a blocking
exit code would only teach people to skip it.

#### Scenario: Uncovered scenarios still exit 0

- **WHEN** a run finds scenarios that no test covers
- **THEN** the command reports them and exits 0

#### Scenario: A broken run exits non-zero

- **WHEN** the command cannot read the change or the test results
- **THEN** it exits 3 and names what it could not read
