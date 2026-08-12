## Purpose

Drafts OpenSpec requirements and scenarios for code that already shipped, so
functionality written before the specs existed gets described. Every draft
waits for a human to confirm it before it counts as a spec.

## ADDED Requirements

### Requirement: backfill command exists

dod-guard SHALL provide `dod-guard backfill <path>`. The command reads the code
and tests under that path and writes drafted requirements and scenarios for
behavior that no current spec describes.

#### Scenario: Command drafts requirements for a path

- **WHEN** a user runs `dod-guard backfill <path>` on code with no spec
- **THEN** the command writes a draft spec covering behavior it found
- **AND** names the source file and test behind each drafted requirement

#### Scenario: A path that does not exist is a usage error

- **WHEN** a user runs `dod-guard backfill` on a path that does not exist
- **THEN** the command exits 3 and names the path

### Requirement: Backfill skips behavior an existing spec covers

The command SHALL read the current specs first and draft only what they do not
already describe. Drafting a duplicate requirement would create two contracts
for one behavior.

#### Scenario: Covered behavior produces no draft

- **WHEN** an existing requirement already describes a behavior found under the path
- **THEN** the command drafts nothing for that behavior
- **AND** reports which existing requirement already covers it

#### Scenario: Partly covered behavior drafts only the gap

- **WHEN** an existing requirement covers some of a behavior and not the rest
- **THEN** the command drafts a scenario for the uncovered part only

### Requirement: Every drafted requirement carries a confirmation state

A drafted requirement SHALL be marked as drafted until a human confirms it. A
machine wrote it by reading code, so it records what the code does, not what
anyone decided the code should do.

#### Scenario: A fresh draft is unconfirmed

- **WHEN** the command writes a new drafted requirement
- **THEN** that requirement carries an unconfirmed state

#### Scenario: An unconfirmed requirement does not satisfy coverage

- **WHEN** `dod-guard cover` reads a scenario under an unconfirmed requirement
- **THEN** it reports that scenario as unconfirmed rather than covered

#### Scenario: A confirmed requirement behaves like any other

- **WHEN** a human confirms a drafted requirement
- **THEN** that requirement loses its drafted mark
- **AND** every later command treats it the same as a hand-written requirement

### Requirement: Backfill records the evidence for each draft

Each drafted requirement SHALL name the code and the test it came from. A
reviewer confirms a draft by reading that evidence, so a draft without it
cannot be reviewed.

#### Scenario: A draft from a test names that test

- **WHEN** the command drafts a requirement from an existing test
- **THEN** the draft names that test file and the case within it

#### Scenario: A draft from code alone says no test backed it

- **WHEN** the command drafts a requirement from code that no test exercises
- **THEN** the draft states that no test backed it
- **AND** the reviewer sees that before confirming

### Requirement: Backfill never edits a confirmed requirement

The command SHALL only add drafts. It MUST NOT change or delete a requirement a
human already confirmed, even when the code disagrees with it.

#### Scenario: Code that contradicts a confirmed requirement is reported

- **WHEN** the command finds code that contradicts a confirmed requirement
- **THEN** it leaves that requirement untouched
- **AND** reports the contradiction for a human to settle

#### Scenario: A second run does not duplicate its own earlier drafts

- **WHEN** the command runs twice on the same path with no code change between runs
- **THEN** the second run adds no new drafted requirement
