## Purpose
Skill that creates OpenSpec changes with all planning artifacts using the dod-guard-spec-driven schema, generates steps.json via the dod-guard CLI, and validates the result before handing off to implementation.

## ADDED Requirements

### Requirement: Use the dod-guard-spec-driven schema by default
The skill SHALL use `dod-guard-spec-driven` as the default schema when creating a new change, unless the user explicitly requests a different one. This schema produces five artifacts: proposal, specs, design, tasks, and steps.

#### Scenario: Default schema used
- **WHEN** the user runs `/opsx:propose` without specifying a schema
- **THEN** the skill creates the change with the `dod-guard-spec-driven` schema

#### Scenario: User requests different schema
- **WHEN** the user explicitly names a different schema
- **THEN** the skill uses that schema instead

### Requirement: Generate steps.json via dod-guard CLI
The skill SHALL run `dod-guard steps <change-id>` after writing `tasks.md` to generate `steps.json`. It SHALL NOT hand-write `steps.json`. After generation, it SHALL fill in the `files` and `verify_surface` fields and correct the dependency chain where steps are genuinely independent.

#### Scenario: Steps generated from tasks
- **WHEN** `tasks.md` is written with `<!-- covers: -->` annotations
- **THEN** the skill runs `dod-guard steps <change-id>` and the resulting `steps.json` has one step per task item

#### Scenario: Steps generated without covers annotations
- **WHEN** `tasks.md` has tasks with no `<!-- covers: -->` annotations
- **THEN** every step in `steps.json` has `manual_required: true` and an empty `verify_cmd`

### Requirement: Validate before handoff
The skill SHALL run `openspec validate <change-id> --strict --no-interactive` after all artifacts are written. It SHALL fix any validation errors before presenting the change as ready.

#### Scenario: Validation passes
- **WHEN** all artifacts are written and validation passes
- **THEN** the skill reports the change as ready and suggests `/opsx:apply` or `/dod-guard:step-by-step`

#### Scenario: Validation fails
- **WHEN** validation reports errors
- **THEN** the skill fixes them and re-validates before reporting the change as ready

### Requirement: Planning boundary
The skill SHALL NOT edit project code. It creates planning artifacts only. After the artifacts are complete, it stops and waits for a new user request.

#### Scenario: User asks to implement during proposal
- **WHEN** the user asks to start building while the skill is creating artifacts
- **THEN** the skill finishes the current artifact, stops, and tells the user to run `/opsx:apply`

### Requirement: Capability group organization
The skill SHALL place spec deltas under the correct group directory matching the package the capability belongs to. It SHALL use the existing spec layout at `openspec/specs/<group>/<capability>/spec.md`.

#### Scenario: Spec delta for dod-guard capability
- **WHEN** the change adds a capability to the dod-guard package
- **THEN** the delta spec is written to `specs/dod-guard/<capability>/spec.md`
