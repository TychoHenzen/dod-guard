# quality-guard/architecture-analysis Specification

## Purpose
Defines repository and staged-diff architecture evidence that reveals responsibility, placement, boundary, and structural-change problems a single-file metric cannot decide.
## Requirements
### Requirement: Analysis compares staged architecture with its base
The architecture analysis SHALL compare the content in the Git index with `HEAD`. It SHALL account for added, modified, deleted, renamed, and moved source files. It SHALL use staged content rather than unstaged working-tree content.

#### Scenario: Staged file differs from the working tree
- **WHEN** a source file has one version in the Git index and a later unstaged edit in the working tree
- **THEN** the analysis evaluates the indexed version and excludes the unstaged edit

#### Scenario: Type moves between directories
- **WHEN** the staged change removes a type from one path and adds the same type under another path
- **THEN** the analysis reports a move rather than unrelated deletion and addition evidence

### Requirement: Responsibility growth carries concrete evidence
The analysis SHALL identify when an existing type gains methods, fields, imports, public members, or dependencies. Each responsibility-growth finding SHALL name the type and the added structural elements. The analysis SHALL classify this evidence as review-required rather than claiming that every addition is a violation.

#### Scenario: Existing class gains a new dependency and operation
- **WHEN** a staged change adds an imported subsystem and a method using it to an existing class
- **THEN** the analysis emits a responsibility-growth review finding naming the class, dependency, and method

#### Scenario: Method changes without structural growth
- **WHEN** a staged change edits a method body without adding a method, field, import, public member, or dependency
- **THEN** the analysis emits no responsibility-growth finding for that edit

### Requirement: Placement analysis detects flat and generic accumulation
The analysis SHALL measure direct production-type growth in each affected directory. It SHALL report review findings when a directory already beyond its configured direct-type limit gains another type. It SHALL also report a review finding when a new production type is added to a configured generic bucket such as `utils`, `common`, or `helpers`.

#### Scenario: Overloaded directory gains another class
- **WHEN** an affected directory already exceeds its configured direct-type limit and the staged change adds another production type directly beneath it
- **THEN** the analysis reports the directory, its before and after counts, and the added type

#### Scenario: Type is placed in a domain directory
- **WHEN** a staged change adds a type to a directory below its configured limit whose name is not a generic bucket
- **THEN** the placement analysis emits no flat-accumulation finding

### Requirement: Dependency boundaries are enforceable
The analysis SHALL construct dependencies between affected production modules. Repository configuration SHALL be able to declare forbidden dependency directions. A staged dependency that violates a configured boundary, or introduces a dependency cycle, SHALL be a deterministic failure.

#### Scenario: Policy imports a forbidden driver
- **WHEN** repository configuration forbids a policy path from depending on an infrastructure path and the staged change adds that dependency
- **THEN** the analysis reports a deterministic boundary failure naming both paths and the dependency

#### Scenario: Staged edge closes a cycle
- **WHEN** a new staged dependency makes a production dependency path cyclic
- **THEN** the analysis reports the complete cycle as a deterministic failure

### Requirement: Encapsulation and change locality are measured
The analysis SHALL report public-surface growth, newly test-only production seams, and compatibility forwarding paths. It SHALL use Git history to identify affected files that do not normally change with the rest of the staged structural unit. History-based locality evidence SHALL be review-required and SHALL NOT become a deterministic failure by itself.

#### Scenario: Public surface grows without a production caller
- **WHEN** the staged change adds a public symbol that has no staged or existing production reference
- **THEN** the analysis reports the symbol as encapsulation evidence and includes its observed callers

#### Scenario: File is outside the historical change cluster
- **WHEN** an affected file rarely changes with the other files in the staged structural unit
- **THEN** the analysis reports the history window and co-change counts as a locality review finding

### Requirement: Refactor analysis reports structural progress
For refactor intent, the analysis SHALL compare responsibility owners, dependency edges, public surface, direct-type placement, and deleted compatibility paths before and after the staged change. It SHALL report which indicators improved, regressed, or stayed unchanged. Local metric reductions alone SHALL NOT be reported as architectural progress.

#### Scenario: Responsibility moves to a focused module
- **WHEN** a staged refactor removes an operation and dependency from one owner and adds them to a focused owner without adding a forwarding shim
- **THEN** the analysis reports the ownership move and dependency reduction as structural progress

#### Scenario: Refactor only renames and reformats
- **WHEN** a staged refactor changes names and formatting but leaves owners, dependencies, placement, public surface, and compatibility paths unchanged
- **THEN** the analysis reports no architectural progress

### Requirement: Every finding is reproducible
Each analysis finding SHALL have a stable identifier, severity class, affected paths, before evidence, after evidence, and a concise reason. Running the analysis twice against the same base and staged content SHALL produce the same findings in the same order.

#### Scenario: Identical staged snapshot is analyzed twice
- **WHEN** the base, staged content, configuration, and Git history are unchanged between two runs
- **THEN** both reports contain identical ordered findings and identifiers

#### Scenario: Required analysis cannot complete
- **WHEN** the staged snapshot or dependency evidence cannot be read
- **THEN** the analysis reports an error and does not return a clean result

