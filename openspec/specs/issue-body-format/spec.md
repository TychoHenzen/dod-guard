## Purpose

Defines the section set of a refined parent issue so that its plan reads in OpenSpec's shape, and the format gate that enforces that shape before the issue reaches Todo.

## Requirements

### Requirement: Refined parent issue sections
A parent issue refined by `refine-backlog-item` SHALL contain, in this order, the sections `## Why`, `## What Changes`, `## Design`, `## Implementation notes`, `## Acceptance criteria`, and `## Verification`. `## What Changes` SHALL list the capabilities that the issue adds or changes and SHALL state explicit non-goals. A newly refined issue SHALL NOT contain `## Outcome` or `## Scope`.

#### Scenario: Newly refined feature issue
- **WHEN** `refine-backlog-item` finishes refining a feature issue
- **THEN** the issue body contains the six sections in order, and `## What Changes` lists at least one capability and at least one non-goal

#### Scenario: Small clear fix
- **WHEN** `refine-backlog-item` refines a small clear fix that needs no feature records
- **THEN** the issue body still contains the six sections, and `## Design` may state that no design decision is needed

### Requirement: Requirements encode OpenSpec requirements
Each bullet of the `requirements` record SHALL start with its id, then name its delta operation (`ADDED`, `MODIFIED`, `REMOVED`, or `RENAMED`), its capability, and its requirement name, followed by a statement that uses SHALL or MUST. The form SHALL be `- R-<n> (<operation>, <capability>) <requirement name>: <statement>`.

#### Scenario: Well-formed requirement bullet
- **WHEN** the `requirements` record holds `- R-1 (ADDED, card-rules) Hand size limit: The game SHALL reject a draw that exceeds seven cards.`
- **THEN** the format check maps it to an ADDED requirement named "Hand size limit" in the `card-rules` capability

#### Scenario: Requirement without SHALL
- **WHEN** a requirement bullet states its rule without SHALL or MUST
- **THEN** the format check fails and names the requirement id

### Requirement: Acceptance criteria encode scenarios
Each `## Acceptance criteria` checkbox SHALL keep the form `- [ ] AC-<n> (<requirement ids>) <scenario name>: WHEN <condition> THEN <outcome>`. Each checkbox SHALL become a scenario of every requirement that it cites. Every requirement SHALL be cited by at least one checkbox.

#### Scenario: Criterion cites two requirements
- **WHEN** a checkbox reads `- [ ] AC-2 (R-1, R-3) Draw at limit: WHEN the hand holds seven cards THEN the draw is refused`
- **THEN** the format check adds the scenario "Draw at limit" to both R-1 and R-3

#### Scenario: Requirement without a scenario
- **WHEN** no checkbox cites R-4
- **THEN** the format check fails and names R-4

### Requirement: OpenSpec format gate before Todo
Refinement SHALL map the read-back issue body into a temporary OpenSpec change folder outside the checkout and run `openspec validate --strict` on it. The issue SHALL NOT move to Todo unless that validation passes. A missing `openspec` CLI SHALL stop refinement with an error that names the missing command.

#### Scenario: Valid body
- **WHEN** the mapped change folder passes `openspec validate --strict`
- **THEN** the format check exits 0 and refinement may continue to the Todo move

#### Scenario: Invalid body
- **WHEN** `openspec validate --strict` reports an error for the mapped change folder
- **THEN** the format check exits 1, prints each reported error with the requirement id it came from, and the issue stays in its current Status

#### Scenario: OpenSpec CLI missing
- **WHEN** the `openspec` command cannot be started
- **THEN** the format check exits 2 and the message names `openspec` as the missing command

### Requirement: Existing parsed headings keep working
The headings `## Acceptance criteria` and `## Implementation notes` and the existing record names SHALL keep their names, so that `complete-pr`, `review-pr`, `fix-pr-review`, and `handoff-proof.mjs` read old and new issue bodies alike.

#### Scenario: In-flight issue with the old section set
- **WHEN** `complete-pr` runs on a parent issue that still has `## Outcome` and `## Scope`
- **THEN** it reads the acceptance criteria and records exactly as before this change
