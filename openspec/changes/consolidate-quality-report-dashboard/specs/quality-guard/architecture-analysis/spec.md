## ADDED Requirements

### Requirement: Current-state analysis reports cross-file concerns
The architecture analysis SHALL evaluate the current production tree without requiring a staged base comparison. It SHALL report placement accumulation, configured dependency-direction violations, complete dependency cycles, and unused public-surface encapsulation concerns as separate ordered groups. Placement entries SHALL name `directory`, `typeCount`, `limit`, and sorted `types`. Dependency entries SHALL name `from`, `to`, and the violated configured rule. Cycle entries SHALL contain the complete closed path. Encapsulation entries SHALL name `path`, `symbol`, and sorted production and test callers.

Every group SHALL sort by its repository-relative path tuple and then symbol or rule. Finding identity SHALL be the group plus those sorted evidence fields, and identical identities SHALL appear once.

#### Scenario: Current repository contains cross-file concerns
- **WHEN** current-state analysis reads a repository containing examples from all four concern groups
- **THEN** each concern appears once in its corresponding group with repository-relative paths and concrete evidence

#### Scenario: Current repository has no configured dependency violation
- **WHEN** every observed dependency follows the configured directions
- **THEN** the dependency group is empty rather than inferred from unrelated structural findings

### Requirement: Current-state findings exclude parser artifacts
Current-state analysis SHALL derive symbols and edges only from declarations and static imports the canonical scanner supports in TypeScript/JavaScript, C#, Rust, Python, Go, Java/Kotlin, and C/C++. It SHALL NOT report language keywords, local variables, object keys, or repeated observations as public symbols. When dynamic loading, reflection, generated code, unresolved imports, or an unsupported declaration prevents complete caller resolution, the analysis SHALL record an extraction error and omit the uncertain encapsulation finding rather than call the symbol unused.

#### Scenario: Implementation contains control flow and local data
- **WHEN** a source file contains control-flow keywords, local variables, and repeated member use
- **THEN** none is reported as a public-surface concern and no identical concern is repeated

#### Scenario: Public symbol has no production caller
- **WHEN** a supported public symbol has no production reference
- **THEN** the encapsulation group reports that symbol once with its observed callers

#### Scenario: Caller resolution is incomplete
- **WHEN** dynamic, generated, unresolved, or unsupported code could supply a caller
- **THEN** the analysis records the affected target as incomplete and emits no unused-public-surface finding for it
