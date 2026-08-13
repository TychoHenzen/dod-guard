# dod-guard/opsx-dashboard Specification

## Purpose
Skill that starts and stops the openspec-dashboard browser server and directs the user to the correct URL, so they can browse specs and changes without leaving Claude Code.
## Requirements
### Requirement: Start the dashboard server
The skill SHALL start `node tools/openspec-dashboard/serve.mjs` as a background process when no instance is already running. It SHALL report the bound URL after the server prints its listening address.

#### Scenario: No dashboard running
- **WHEN** the user runs `/opsx:dashboard` and no dashboard process is listening
- **THEN** the skill starts the server in the background and reports the URL it bound to

#### Scenario: Dashboard already running
- **WHEN** the user runs `/opsx:dashboard` and a dashboard process is already listening on a port in the 4400-4420 range
- **THEN** the skill reports the existing URL instead of starting a second instance

### Requirement: Stop the dashboard server
The skill SHALL stop a running dashboard when the user asks to stop it. It SHALL identify the process by the port it bound to.

#### Scenario: User asks to stop
- **WHEN** the user runs `/opsx:dashboard stop`
- **THEN** the skill finds and stops the running dashboard process and confirms it stopped

#### Scenario: No dashboard to stop
- **WHEN** the user runs `/opsx:dashboard stop` and no dashboard is running
- **THEN** the skill reports that no dashboard was found

### Requirement: Direct user to the dashboard
The skill SHALL tell the user to open the reported URL in a browser. When the current project is registered in the dashboard, the skill SHALL say so. When it is not, the skill SHALL offer to register it.

#### Scenario: Project is registered
- **WHEN** the dashboard starts and the current project appears in the dashboard registry
- **THEN** the skill reports the URL and tells the user they can see this project's specs there

#### Scenario: Project is not registered
- **WHEN** the dashboard starts and the current project is not in the registry
- **THEN** the skill offers to register the project before directing the user to the URL

### Requirement: Locate the dashboard script
The skill SHALL find the dashboard entry point relative to the dod-guard package installation. It SHALL NOT hard-code an absolute path.

#### Scenario: Script found via package resolution
- **WHEN** the skill needs to start the dashboard
- **THEN** it resolves the path to `tools/openspec-dashboard/serve.mjs` relative to the monorepo root or the dod-guard plugin installation directory

