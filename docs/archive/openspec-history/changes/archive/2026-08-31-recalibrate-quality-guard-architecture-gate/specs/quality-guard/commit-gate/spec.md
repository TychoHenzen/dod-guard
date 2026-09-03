## Purpose

Defines one authoritative staged quality decision that agents, local Git hooks, MCP clients, and CI can invoke before accepting a commit.

## ADDED Requirements

### Requirement: One command judges the staged change
The command-line interface SHALL provide `quality-guard check --staged`. It SHALL compare the Git index with `HEAD`, run the repository-wide structural ratchet, and run architecture analysis. It SHALL accept `change` and `refactor` intent, defaulting to `change`.

#### Scenario: Ordinary staged change is checked
- **WHEN** the caller runs `quality-guard check --staged` in a Git repository
- **THEN** the command evaluates only staged source content with change intent

#### Scenario: Refactor target is missing
- **WHEN** the caller selects refactor intent without naming a target scope
- **THEN** the command reports a usage error and does not return a quality verdict

### Requirement: Verdict states have fixed precedence
The gate SHALL return `PASS`, `REVIEW_REQUIRED`, or `FAIL`. A deterministic failure or required-analysis error SHALL produce `FAIL`. In the absence of failure, any unacknowledged review finding SHALL produce `REVIEW_REQUIRED`. Only a complete run with no failure and no unacknowledged review finding SHALL produce `PASS`.

#### Scenario: Failure and review finding coexist
- **WHEN** one check fails deterministically and another emits a review finding
- **THEN** the overall verdict is `FAIL` and the report includes both findings

#### Scenario: All evidence is accepted
- **WHEN** every deterministic check passes and every review finding has a current acknowledgement
- **THEN** the overall verdict is `PASS`

### Requirement: Process exit codes preserve the verdict
The staged command SHALL exit 0 for `PASS`, 1 for `FAIL`, 2 for `REVIEW_REQUIRED`, and 3 for a usage error. Its human report and JSON report SHALL name the same verdict and findings.

#### Scenario: Review blocks a Git hook
- **WHEN** the staged command returns `REVIEW_REQUIRED`
- **THEN** it exits 2 so an invoking pre-commit hook refuses the commit

#### Scenario: Invalid option is passed
- **WHEN** the caller passes an unsupported intent value
- **THEN** the command exits 3 and prints usage information

### Requirement: Architectural acknowledgements bind to staged content
The gate SHALL fingerprint staged source content while excluding its own decision-record file. An acknowledgement SHALL name the finding identifier, fingerprint, reason, and author. The gate SHALL accept an acknowledgement only when its fingerprint matches the current staged source fingerprint.

#### Scenario: Finding is acknowledged for the current stage
- **WHEN** a review record names the current fingerprint and every current review finding
- **THEN** those findings no longer force `REVIEW_REQUIRED`

#### Scenario: Source changes after acknowledgement
- **WHEN** staged source content changes after a review record was written
- **THEN** the new fingerprint invalidates the prior acknowledgement

### Requirement: Refactor intent requires structural evidence
With refactor intent, the gate SHALL require a responsibility map and desired ownership or boundary outcome for the target. It SHALL include the architecture analysis progress report. When the staged change shows no progress toward the declared structural outcome, the gate SHALL return `REVIEW_REQUIRED` even if local metrics improve.

#### Scenario: Local metrics improve without ownership change
- **WHEN** a refactor reduces file length and complexity but makes no progress toward its declared ownership or boundary outcome
- **THEN** the gate returns `REVIEW_REQUIRED` with the unchanged structural indicators

#### Scenario: Declared structural outcome is achieved
- **WHEN** the staged refactor satisfies its declared ownership and boundary outcome without a deterministic regression
- **THEN** the refactor-evidence requirement does not prevent `PASS`

### Requirement: Local and CI execution agree
CI SHALL replay the same staged-decision core against the committed tree and its first parent. A local hook bypass SHALL NOT change the CI verdict. Given the same base, content, configuration, and review records, local command, MCP operation, and CI SHALL return the same verdict and finding identifiers.

#### Scenario: Commit bypasses the local hook
- **WHEN** a commit reaches CI without a local staged-gate run
- **THEN** CI reconstructs the commit change and applies the same decision

#### Scenario: Local and CI inputs match
- **WHEN** local and CI runs use identical decision inputs
- **THEN** their verdicts and ordered finding identifiers match

### Requirement: Non-source commits report their limited scope
When no supported source or architecture-configuration file is staged, the gate SHALL return `PASS` and state that no source quality decision was required. It SHALL NOT claim that unrelated repository checks passed.

#### Scenario: Documentation-only commit
- **WHEN** the staged change contains only Markdown documentation outside quality configuration
- **THEN** the gate returns `PASS` with a no-source-changes reason

