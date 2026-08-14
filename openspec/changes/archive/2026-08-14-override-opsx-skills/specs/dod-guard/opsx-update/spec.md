## Purpose
Skill that revises a change's planning artifacts, keeps them coherent, and regenerates steps.json when tasks change, so the execution plan stays in sync with the planning artifacts.

## ADDED Requirements

### Requirement: Regenerate steps on task changes
The skill SHALL regenerate `steps.json` by running `dod-guard steps <change-id>` whenever `tasks.md` is modified. It SHALL preserve the status of steps that match unchanged tasks.

#### Scenario: Task added
- **WHEN** the user adds a new task to `tasks.md`
- **THEN** the skill regenerates `steps.json` and the new task appears as a pending step

#### Scenario: Task reworded
- **WHEN** the user rewords an existing task
- **THEN** the skill regenerates `steps.json` and the step's description matches the new text

### Requirement: Artifact coherence
The skill SHALL check whether changes to one artifact invalidate another. When a proposal's capabilities change, specs may need updating. When specs change, tasks may need updating. The skill SHALL report which downstream artifacts are affected and offer to update them.

#### Scenario: Proposal capability added
- **WHEN** the user adds a capability to `proposal.md`
- **THEN** the skill reports that a new spec delta is needed and offers to create it

#### Scenario: Spec scenario removed
- **WHEN** the user removes a scenario from a spec delta
- **THEN** the skill reports whether any task's `<!-- covers: -->` annotation references the removed scenario

### Requirement: Validate after updates
The skill SHALL run `openspec validate <change-id> --strict --no-interactive` after updating any artifact. It SHALL fix validation errors before reporting the update as complete.

#### Scenario: Update introduces validation error
- **WHEN** an artifact edit causes `openspec validate` to fail
- **THEN** the skill fixes the error and re-validates

### Requirement: Planning boundary
The skill SHALL NOT edit project code. It revises planning artifacts only.

#### Scenario: User asks to implement during update
- **WHEN** the user asks to start coding while revising artifacts
- **THEN** the skill refuses and suggests `/opsx:apply`
