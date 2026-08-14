## Purpose
Interactive tutorial and guidance skill that teaches the OpenSpec + dod-guard workflow, maps user intent to the right skill, and walks through worked examples using the current project's specs and changes.

## ADDED Requirements

### Requirement: Intent mapping
The skill SHALL ask the user what they want to do and map their answer to the right skill. It SHALL present options via AskUserQuestion rather than open-ended text.

#### Scenario: User wants to build something new
- **WHEN** the user selects "I want to build a new feature"
- **THEN** the skill explains the propose -> apply -> archive flow and suggests `/opsx:propose` or `/opsx:quick` depending on scope

#### Scenario: User wants to understand their specs
- **WHEN** the user selects "I want to read my specs and see what is covered"
- **THEN** the skill suggests `/opsx:dashboard` to start the browser dashboard and explains how to use it

#### Scenario: User wants to fix a bug
- **WHEN** the user selects "I want to fix a bug or issue"
- **THEN** the skill explains using `/opsx:quick` for small fixes or `/interview` for bugs that need investigation

#### Scenario: User wants to understand the system
- **WHEN** the user selects "I want to learn how this workflow works"
- **THEN** the skill shows the lifecycle diagram and explains each phase

### Requirement: Lifecycle diagram
The skill SHALL display an ASCII diagram showing the full lifecycle when the user asks how the workflow works. The diagram SHALL show the phases (explore, propose/interview, apply/step-by-step, cover, archive) and the artifacts each produces.

#### Scenario: Lifecycle diagram shown
- **WHEN** the user asks how the workflow works or selects the learning option
- **THEN** the skill displays the lifecycle diagram with phases, skills, and artifacts

### Requirement: Concept explanations
The skill SHALL explain OpenSpec concepts when the user asks. Concepts include: scenario, capability, requirement, change, delta spec, main spec, coverage, archiving, the dod-guard-spec-driven schema, and steps.json.

#### Scenario: User asks what a scenario is
- **WHEN** the user asks "what is a scenario?"
- **THEN** the skill explains that a scenario is a WHEN/THEN test case under a requirement, gives the format, and shows one from the current project's specs if any exist

#### Scenario: User asks what archiving does
- **WHEN** the user asks about archiving
- **THEN** the skill explains that archiving merges delta specs into main specs and moves the change to the archive, and that `dod-guard cover` must pass first

### Requirement: Worked examples from current project
The skill SHALL use the current project's actual specs, changes, and coverage data when walking through examples. It SHALL run `openspec list --json`, `openspec list --specs --json`, and `dod-guard cover --all` to get real data.

#### Scenario: Project has specs
- **WHEN** the project has specs under `openspec/specs/`
- **THEN** the skill uses one to show what a real spec looks like and how its scenarios bind to tests

#### Scenario: Project has no specs
- **WHEN** the project has no `openspec/` directory
- **THEN** the skill suggests `/opsx:init` to set up OpenSpec first

### Requirement: Dashboard integration
The skill SHALL suggest the dashboard as the primary way to read specs and track changes. It SHALL offer to start the dashboard via `/opsx:dashboard` when it is not running.

#### Scenario: Dashboard not running
- **WHEN** the user asks to see their specs and the dashboard is not running
- **THEN** the skill offers to start it via `/opsx:dashboard`

### Requirement: Skill reference
The skill SHALL list all available `/opsx:*` skills with a one-sentence description of each when the user asks for a reference. It SHALL group them by phase: setup, planning, implementation, and maintenance.

#### Scenario: User asks for skill list
- **WHEN** the user asks "what skills are available?" or "what can I do?"
- **THEN** the skill lists all `/opsx:*` skills grouped by phase with one sentence each
