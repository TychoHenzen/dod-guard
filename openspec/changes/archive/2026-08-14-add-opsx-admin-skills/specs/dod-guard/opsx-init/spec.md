## Purpose
Skill that initializes OpenSpec in a new project, configures the workflow schema and project context, and registers the project in the dashboard so the user can browse its specs immediately.

## ADDED Requirements

### Requirement: Project detection before initialization
The skill SHALL check whether the target directory already has an `openspec/` directory before running `openspec init`. When the directory exists, the skill SHALL report what is already set up and offer to reconfigure rather than re-initialize.

#### Scenario: Fresh project with no OpenSpec directory
- **WHEN** the user runs `/opsx:init` in a directory that has no `openspec/` subdirectory
- **THEN** the skill runs `openspec init --tools claude` and reports the created structure

#### Scenario: Project already initialized
- **WHEN** the user runs `/opsx:init` in a directory that already has an `openspec/` directory
- **THEN** the skill reports the existing setup (schema, spec count, change count) and offers to reconfigure the schema or project context instead of re-initializing

### Requirement: Schema setup
The skill SHALL offer to copy the `dod-guard-spec-driven` schema into the project's `openspec/schemas/` directory when the project does not already have a custom schema. It SHALL set the schema in `openspec/config.yaml` when the user accepts.

#### Scenario: No custom schema exists
- **WHEN** the project has no `openspec/schemas/` directory
- **THEN** the skill offers to copy the `dod-guard-spec-driven` schema and set it as the default in `config.yaml`

#### Scenario: Custom schema already exists
- **WHEN** the project already has a schema in `openspec/schemas/`
- **THEN** the skill reports the existing schema name and does not overwrite it

#### Scenario: User declines schema copy
- **WHEN** the user declines the schema copy
- **THEN** the skill leaves the default `spec-driven` schema and continues with the next step

### Requirement: Project context configuration
The skill SHALL examine the project's files to detect the tech stack, then offer to populate the `context` field in `openspec/config.yaml`. Detection SHALL check `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `*.csproj`, and similar manifest files.

#### Scenario: Node.js TypeScript project detected
- **WHEN** the project has a `package.json` with a `typescript` dependency and uses `node:test`
- **THEN** the skill proposes a context block naming TypeScript, the test runner, and the bundler

#### Scenario: No recognizable manifest
- **WHEN** the project has no standard language manifest files
- **THEN** the skill asks the user to describe the tech stack and writes what they say into the context

### Requirement: Dashboard registration
The skill SHALL check whether the project is registered in `~/.openspec-dashboard/projects.json`. When it is not, the skill SHALL add it. The skill SHALL report whether the dashboard server is running and print its URL when it is.

#### Scenario: Project not in dashboard registry
- **WHEN** the project's directory is not listed in `~/.openspec-dashboard/projects.json`
- **THEN** the skill adds it and reports that the project is now visible in the dashboard

#### Scenario: Project already registered
- **WHEN** the project's directory is already in the dashboard registry
- **THEN** the skill reports that and does not duplicate the entry

### Requirement: Completion summary
The skill SHALL print a summary listing what was set up: the OpenSpec root path, the active schema, the project context (if configured), and the dashboard registration state. It SHALL name the next skill to run (`/opsx:propose` to create the first change, or `/opsx:guide` for a walkthrough).

#### Scenario: All steps completed
- **WHEN** initialization, schema setup, context configuration, and dashboard registration are done
- **THEN** the skill prints a summary with the four outcomes and suggests the next step
