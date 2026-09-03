## MODIFIED Requirements

### Requirement: Server exposes three tools

The server SHALL expose a scan tool that reports violations. It SHALL expose a baseline gate tool that returns a ratchet verdict. It SHALL expose a waiver tool that lists open skip records. It SHALL expose a commit-gate tool that judges staged content. Each SHALL return text content.

#### Scenario: Client lists the tools
- **WHEN** a client asks the server what tools it offers
- **THEN** the server names the scan tool, baseline gate tool, waiver tool, and commit-gate tool, each with a description

## ADDED Requirements

### Requirement: Commit-gate tool uses the authoritative decision
The commit-gate tool SHALL require a repository root and SHALL accept change or refactor intent plus an optional target. It SHALL return the same verdict, fingerprint, and ordered findings as `quality-guard check --staged` for the same Git state. It SHALL NOT maintain a second implementation of the decision rules.

#### Scenario: Agent checks a staged change
- **WHEN** an MCP client invokes the commit-gate tool for a repository with staged source changes
- **THEN** the tool returns `PASS`, `REVIEW_REQUIRED`, or `FAIL` with the staged fingerprint and findings

#### Scenario: Refactor tool call omits target
- **WHEN** an MCP client selects refactor intent without a target
- **THEN** the tool returns a concise usage error as text and no stack trace

