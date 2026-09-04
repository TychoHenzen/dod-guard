# code-explorer/project-landmarks Specification

## Purpose
Defines a compact, evidence-ranked project table of contents that exposes useful concepts before the client knows what names to search for.
## Requirements
### Requirement: An empty search returns project landmarks
`code_search` SHALL return the current bounded landmark set when the query is empty and the requested filters permit landmark discovery.

#### Scenario: Client has no search term
- **WHEN** the client submits an empty query without a conflicting filter
- **THEN** the response returns grouped project landmarks with selectable symbol identities

#### Scenario: Landmark index is not ready
- **WHEN** the client submits an empty query before landmark analysis completes
- **THEN** the response reports landmark readiness and does not substitute arbitrary symbols

### Requirement: Landmarks use a visible deterministic score
Each landmark SHALL expose `production_reference_files`, `incoming_call_sites`, `directory_spread`, `public_or_exported`, `test_only`, `score`, and the source of each field. Score SHALL equal three times production-reference files capped at 10, plus four times incoming call sites capped at 10, plus two times distinct first-level project directories capped at 5, plus 5 when the language backend reports public or exported visibility, minus 20 for test-only symbols. Missing evidence SHALL contribute zero. Generated-only symbols SHALL be ineligible. A candidate SHALL need score 5 or greater.

#### Scenario: Public type is used across production directories
- **WHEN** a public type has references from multiple production directories
- **THEN** the landmark reports every evidence counter, evidence source, and the score produced by the declared formula

#### Scenario: Call evidence is unavailable
- **WHEN** a backend cannot provide incoming call hierarchy for a candidate
- **THEN** the candidate carries no incoming-call evidence and is not awarded inferred calls

### Requirement: Tests and generated content do not dominate landmarks
Landmark ranking SHALL penalize test-only symbols and SHALL exclude generated-only symbols by default.

#### Scenario: Symbol appears only in tests
- **WHEN** a symbol has test references but no detected production reference
- **THEN** its evidence identifies it as test-only and ranks it below an otherwise comparable production symbol

#### Scenario: Generated symbol duplicates a source symbol
- **WHEN** generated output contains a duplicate of a source landmark
- **THEN** only the source identity contributes to the default landmark set

### Requirement: Landmark groups remain meaningful and bounded
The landmark response SHALL assign each candidate to one group by this priority: messages or events, services, entry points, types, then common actions. Messages or events are type symbols whose normalized names end in `event`, `message`, `command`, `request`, or `response`. Services are type symbols ending in `service`, `manager`, `controller`, `repository`, `provider`, or `client`. Entry points are callables identified as entry points by the semantic backend or named `main`. Remaining type symbols are types. Remaining callable symbols are common actions. Every group SHALL default to 12 results and SHALL reject a requested per-group limit above 50.

#### Scenario: Project contains candidates for several groups
- **WHEN** landmark analysis completes for a project with types, events, services, entry points, and actions
- **THEN** each selected candidate appears in one declared group with its path, kind, identity, and evidence

#### Scenario: One group exceeds its limit
- **WHEN** more candidates qualify for a group than its configured limit
- **THEN** the response returns the bounded leading candidates and the omitted count for that group

#### Scenario: Related message and service symbols remain distinct
- **WHEN** the project contains an `OrderEvent` sent by an `OrderService`
- **THEN** `OrderEvent` appears once in messages or events and `OrderService` appears once in services

### Requirement: Raw word frequency never establishes a landmark
A name SHALL NOT become a landmark solely because its text occurs frequently in source content.

#### Scenario: Generic identifier occurs most often
- **WHEN** a generic identifier such as `value` occurs frequently but lacks landmark evidence
- **THEN** frequency alone does not select or promote it as a landmark

#### Scenario: Landmark scores tie
- **WHEN** two candidates have equal supported evidence
- **THEN** their order is resolved deterministically by group, normalized path, kind, and symbol identity

#### Scenario: Language does not report visibility
- **WHEN** a candidate's backend does not report public or exported visibility
- **THEN** visibility contributes zero and the evidence identifies that field as unavailable
