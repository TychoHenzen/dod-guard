## Purpose
Skill that implements an OpenSpec change by routing through the step-by-step execution pipeline, running dod-guard cover as a verification gate, and archiving the change when coverage holds.

## ADDED Requirements

### Requirement: Route through step-by-step
The skill SHALL delegate implementation to `/dod-guard:step-by-step` when the change has a `steps.json`. It SHALL NOT implement tasks directly by looping through checkboxes. The step-by-step skill dispatches workers, runs verification commands, and commits per step.

#### Scenario: Change has steps.json
- **WHEN** the user runs `/opsx:apply` on a change that has a `steps.json`
- **THEN** the skill invokes `/dod-guard:step-by-step` with the change id

#### Scenario: Change has no steps.json
- **WHEN** the change has tasks but no `steps.json`
- **THEN** the skill runs `dod-guard steps <change-id>` to generate it, then invokes `/dod-guard:step-by-step`

### Requirement: Regenerate stale steps
The skill SHALL check whether `steps.json` is stale by comparing its `plan_artifacts` snapshot against `openspec status --json --change <id>`. When the artifacts differ, the skill SHALL offer to regenerate with `dod-guard steps <change-id>`.

#### Scenario: Steps are stale
- **WHEN** `steps.json` was generated from a different set of artifact statuses than the current ones
- **THEN** the skill reports the staleness and offers to regenerate

#### Scenario: Steps are current
- **WHEN** `steps.json` matches the current artifact statuses
- **THEN** the skill proceeds directly to step-by-step execution

### Requirement: Coverage gate before archive
The skill SHALL run `dod-guard cover <change-id>` after all steps complete. Exit 0 means coverage holds. Exit 1 means a scenario regressed. Exit 3 means usage error. The skill SHALL NOT archive on exit 1 or 3.

#### Scenario: Coverage passes
- **WHEN** `dod-guard cover` exits 0
- **THEN** the skill runs `openspec archive <change-id> --yes` and reports the result

#### Scenario: Coverage regression
- **WHEN** `dod-guard cover` exits 1
- **THEN** the skill reports which scenarios regressed and does not archive

### Requirement: Change selection
The skill SHALL select the change to apply using the same logic as the generated version: argument, context inference, auto-select if only one, or prompt from `openspec list --json`.

#### Scenario: Single active change
- **WHEN** only one active change exists
- **THEN** the skill auto-selects it and announces the selection
