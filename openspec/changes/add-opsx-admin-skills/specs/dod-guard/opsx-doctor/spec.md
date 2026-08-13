## Purpose
Skill that runs OpenSpec health checks on the current project and reports problems in plain language with fix suggestions, so the user can diagnose configuration and spec issues without reading raw CLI output.

## ADDED Requirements

### Requirement: Run health checks
The skill SHALL run `openspec doctor` and `openspec validate --all --strict --no-interactive` against the current project. When the project uses a store, the skill SHALL pass `--store <id>` on the commands that accept it.

#### Scenario: Both commands succeed
- **WHEN** both `doctor` and `validate` exit 0
- **THEN** the skill reports that the project is healthy

#### Scenario: Doctor reports relationship issues
- **WHEN** `openspec doctor` reports orphaned specs, broken references, or missing scenarios
- **THEN** the skill lists each finding with the affected file path

#### Scenario: Validate reports strict violations
- **WHEN** `openspec validate --all --strict` reports violations
- **THEN** the skill lists each violation with the file path and what is wrong

### Requirement: Plain-language report with fix suggestions
The skill SHALL translate each finding into a sentence describing the problem and a sentence describing how to fix it. It SHALL NOT dump raw CLI output.

#### Scenario: Orphaned spec delta
- **WHEN** doctor reports a delta spec that references a capability with no main spec
- **THEN** the skill explains that the delta targets a capability that does not exist and suggests creating the main spec or correcting the path

#### Scenario: Scenario heading level wrong
- **WHEN** validate reports a scenario using `###` instead of `####`
- **THEN** the skill names the file and line, states that scenarios need four hash marks, and offers to fix it

### Requirement: Store awareness
The skill SHALL check whether the project uses a standalone OpenSpec store. When it does, the skill SHALL run both commands against the store and report which store it checked.

#### Scenario: Project uses a store
- **WHEN** the project's `openspec/config.yaml` references a store id
- **THEN** the skill passes `--store <id>` to `doctor` and `validate` and names the store in the report

#### Scenario: No store configured
- **WHEN** the project uses the local `openspec/` root
- **THEN** the skill runs both commands without `--store` and reports against the local root
