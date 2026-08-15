## Purpose

Deepens a thin spec by discovering missing requirements, edge cases, error paths, and implicit assumptions that the original author did not write down.

## ADDED Requirements

### Requirement: The skill accepts a spec path and produces expanded requirements

The `/spec-explore` skill SHALL accept a capability path (the path under `openspec/specs/`). It SHALL read the existing spec, analyze the capability's purpose and current requirements, and produce a list of proposed new requirements and scenarios. Each proposal SHALL include a requirement name, description text, and at least one scenario in WHEN/THEN format.

#### Scenario: Expanding a spec with three requirements
- **WHEN** the user runs `/spec-explore` against a spec that has three requirements covering the happy path
- **THEN** the skill proposes at least two new requirements covering error conditions, boundary cases, or implicit assumptions not addressed by the existing three

#### Scenario: Spec path does not resolve
- **WHEN** the user runs `/spec-explore` with a path that does not match any spec
- **THEN** the skill reports which path it tried and that no spec was found

### Requirement: The skill reads the implementation to find undocumented behavior

The skill SHALL read the source files that implement the capability (identified by package name from the spec path) and compare observable behavior against the spec. Behavior present in the implementation but absent from the spec SHALL be surfaced as a proposed requirement.

#### Scenario: Implementation has a retry path the spec does not mention
- **WHEN** the implementation retries a failed operation up to three times and the spec says nothing about retries
- **THEN** the skill proposes a requirement that documents or questions the retry behavior

### Requirement: Proposals are written as a delta spec the user can adopt

The skill SHALL write its proposals as a valid delta spec file (using `## ADDED Requirements` with `### Requirement:` and `#### Scenario:` headers). The user SHALL be able to review and selectively adopt proposals into the main spec.

#### Scenario: Output is a valid delta spec
- **WHEN** the skill completes
- **THEN** its output parses as a valid delta spec with at least one `## ADDED Requirements` section, and every requirement has at least one scenario
