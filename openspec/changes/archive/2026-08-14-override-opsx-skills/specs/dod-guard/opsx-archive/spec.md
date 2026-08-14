## Purpose
Skill that gates archiving on dod-guard scenario coverage passing and runs openspec archive only when the coverage check holds, so no change is archived while its scenarios have regressed.

## ADDED Requirements

### Requirement: Coverage gate
The skill SHALL run `dod-guard cover <change-id>` before running `openspec archive`. Exit 0 means the gate passes. Exit 1 means a regression. Exit 3 means usage error. The skill SHALL NOT archive on exit 1 or 3.

#### Scenario: Coverage passes
- **WHEN** `dod-guard cover` exits 0
- **THEN** the skill runs `openspec archive <change-id> --yes`

#### Scenario: Coverage regresses
- **WHEN** `dod-guard cover` exits 1
- **THEN** the skill reports which scenarios regressed and refuses to archive

#### Scenario: Coverage usage error
- **WHEN** `dod-guard cover` exits 3
- **THEN** the skill reports the error and refuses to archive

### Requirement: Skip-specs support
The skill SHALL pass `--skip-specs` to `openspec archive` when the change's `.openspec.yaml` sets `skip_specs: true`. It SHALL skip the `dod-guard cover` gate for such changes because there are no scenarios to check.

#### Scenario: Change has skip_specs
- **WHEN** the change has `skip_specs: true` in `.openspec.yaml`
- **THEN** the skill runs `openspec archive <change-id> --yes --skip-specs` without running `dod-guard cover`

### Requirement: Archive without confirmation
The skill SHALL run `openspec archive --yes` without asking the user for confirmation. The coverage gate is the approval. A change that passes cover has already proved every scenario holds.

#### Scenario: Archive runs without prompt
- **WHEN** coverage passes
- **THEN** the skill archives immediately without asking the user to confirm

### Requirement: Change selection
The skill SHALL select the change using: argument, context inference, auto-select if only one active, or prompt from `openspec list --json`.

#### Scenario: Multiple active changes
- **WHEN** two or more active changes exist and no argument is given
- **THEN** the skill lists them and asks the user to select one
