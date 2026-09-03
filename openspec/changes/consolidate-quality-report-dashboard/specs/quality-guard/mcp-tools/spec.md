## MODIFIED Requirements

### Requirement: Server exposes three tools

The server SHALL expose exactly one structural scan tool that reports violations. It SHALL expose a baseline gate tool that returns a ratchet verdict. It SHALL expose a waiver tool that lists open skip records. It SHALL expose a commit-gate tool that judges staged content. Each SHALL return text content. It SHALL NOT expose a second repository-report wrapper over the structural scan tool.

#### Scenario: Client lists the tools
- **WHEN** a client asks the server what tools it offers
- **THEN** the server names the scan tool, baseline gate tool, waiver tool, and commit-gate tool, each with a description, and names no repository-report tool
