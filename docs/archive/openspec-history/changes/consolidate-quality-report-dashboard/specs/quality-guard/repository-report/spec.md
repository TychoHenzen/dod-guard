## Purpose

Defines the durable repository-quality artifact consumed by local interfaces without creating another structural scanner or MCP scan contract.

## ADDED Requirements

### Requirement: Generator uses canonical quality evidence
The repository-report generator SHALL obtain structural findings from the canonical scanner. It SHALL add current-state placement, dependency-direction, cycle, and encapsulation findings. It SHALL NOT implement a second structural rule set. It SHALL read optional architecture policy from `.quality-guard.json`; an absent file means the documented default policy, while invalid configuration fails generation.

Source and configuration discovery SHALL not traverse symbolic links, junctions, or reparse points. Every candidate file SHALL resolve beneath the selected project root before either the scanner or architecture analysis reads it.

#### Scenario: Repository report is generated
- **WHEN** generation runs for a readable repository
- **THEN** the report contains the canonical scanner findings and the four cross-file concern groups

#### Scenario: Structural scanner rejects the request
- **WHEN** the canonical scanner produces no valid report
- **THEN** generation fails without presenting independently calculated structural findings

#### Scenario: Architecture configuration is invalid
- **WHEN** `.quality-guard.json` exists but does not satisfy its supported configuration contract
- **THEN** generation reports the configuration error and does not replace the prior artifact

#### Scenario: Source path escapes the project
- **WHEN** a candidate source or configuration path is linked or resolves outside the selected project root
- **THEN** generation does not read that path or include evidence from it

### Requirement: Generator writes one durable artifact atomically
The generator SHALL create `.quality` when needed and write the complete report to `.quality/quality-report.json` beneath the selected project root. Before writing, it SHALL resolve the registered root and reject a `.quality` directory, temporary path, or destination that is a symbolic link, junction, reparse point, or resolves outside that root. It SHALL replace the prior artifact only after the new report is complete and valid. Directory creation, temporary-file writing, and replacement failures SHALL leave any prior artifact unchanged.

#### Scenario: Successful regeneration replaces the artifact
- **WHEN** a valid report finishes generating
- **THEN** `.quality/quality-report.json` contains the complete new report

#### Scenario: Failed regeneration preserves prior evidence
- **WHEN** regeneration fails after a valid artifact already exists
- **THEN** the existing artifact remains byte-for-byte unchanged

#### Scenario: Artifact path escapes through filesystem indirection
- **WHEN** any artifact path component is a link, junction, reparse point, or resolves outside the registered project root
- **THEN** generation rejects the destination and writes no file

### Requirement: Report artifacts have one bounded versioned schema
The report root SHALL be an object with `schemaVersion` equal to `1`, an RFC 3339 `generatedAt`, `summaries`, `files`, and `architecture`. Each summary SHALL contain numeric `fileCount`, `errors`, `warnings`, `averageScore`, and `minimumScore`. Each file SHALL contain repository-relative `path`, supported `language`, `production` or `test` classification, numeric score and counts, and an array of findings. Each finding SHALL contain repository-relative `file`, positive integer `line`, `rule`, `error` or `warn` severity, and `message`. `architecture` SHALL contain arrays named `placement`, `dependencies`, `cycles`, and `encapsulation`, plus extraction `errors`. A reader SHALL reject missing fields, wrong types, unsupported versions, absolute or escaping paths, and invalid group entries rather than treating them as an empty report.

The generator and reader SHALL reject reports over 32 MiB, nesting deeper than 32 levels, more than 50,000 files, or more than 100,000 combined structural and architecture findings. Generation SHALL stop after 120 seconds. Limit failures SHALL use bounded error text and preserve the prior artifact and display.

#### Scenario: Malformed artifact is loaded
- **WHEN** a reader loads a report that does not satisfy the supported schema
- **THEN** it returns a validation error and no empty quality result

#### Scenario: Artifact exceeds a resource limit
- **WHEN** generation or loading exceeds a declared byte, depth, file, finding, or time limit
- **THEN** it returns a bounded limit error and preserves the prior artifact and displayed report

### Requirement: Regeneration is serialized per project
At most one generation process SHALL run for one registered project at a time. A second request for that project SHALL return a conflict without launching another process. Requests for different registered projects MAY run independently. Missing, corrupt, or runtime-incompatible generator code SHALL be a generation failure and SHALL preserve any prior artifact.

#### Scenario: Concurrent regeneration targets one project
- **WHEN** regeneration is already running and another request targets the same registered project
- **THEN** the second request returns a conflict without launching a generator or changing the artifact

#### Scenario: Bundled generator cannot load
- **WHEN** the generator is missing, corrupt, or incompatible with the current Node runtime
- **THEN** regeneration returns a launch error and preserves the prior artifact
