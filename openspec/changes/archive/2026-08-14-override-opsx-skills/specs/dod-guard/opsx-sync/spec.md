## Purpose
Skill that syncs delta specs from a change into the main specs under openspec/specs/ using intelligent merging, without archiving the change.

## ADDED Requirements

### Requirement: Intelligent merge
The skill SHALL read each delta spec and apply its operations (ADDED, MODIFIED, REMOVED, RENAMED) to the corresponding main spec. It SHALL add new requirements without copying the entire spec. It SHALL update modified requirements in place.

#### Scenario: ADDED requirement merged
- **WHEN** a delta spec has an ADDED requirement
- **THEN** the skill appends the requirement and its scenarios to the main spec

#### Scenario: MODIFIED requirement merged
- **WHEN** a delta spec has a MODIFIED requirement
- **THEN** the skill replaces the matching requirement block in the main spec with the modified version

#### Scenario: REMOVED requirement merged
- **WHEN** a delta spec has a REMOVED requirement
- **THEN** the skill deletes the matching requirement block from the main spec

### Requirement: New capability creation
The skill SHALL create a new main spec at `openspec/specs/<group>/<capability>/spec.md` when the delta targets a capability that does not exist yet. It SHALL copy the `## Purpose` section from the delta.

#### Scenario: Delta targets nonexistent capability
- **WHEN** the delta spec's path does not match any existing main spec
- **THEN** the skill creates the main spec with the Purpose section and all ADDED requirements

### Requirement: Preserve capability path
The skill SHALL use the exact path from the delta spec when resolving the main spec. It SHALL NOT move or rename capabilities during sync.

#### Scenario: Nested capability path
- **WHEN** the delta spec is at `specs/dod-guard/opsx-init/spec.md`
- **THEN** the main spec is at `openspec/specs/dod-guard/opsx-init/spec.md`
