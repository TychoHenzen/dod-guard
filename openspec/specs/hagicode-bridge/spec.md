## Purpose

Connects a HagiCode proposal session to the GitHub issue: a reviewed local change folder is published into the issue once, and completed local tasks are synced back to sub-issues after they are pushed.

## Requirements

### Requirement: Publish a change folder into the issue
`refine-backlog-item` SHALL accept a local OpenSpec change folder as input for an existing Backlog or Todo issue. It SHALL map the folder's proposal, delta specs, design, and tasks into the issue body sections and the slice sub-issues, and SHALL then run the same research, label, and format-check steps as any other refinement.

#### Scenario: Reviewed HagiCode change
- **WHEN** the user runs refinement on issue 42 with the change folder `openspec/changes/hand-size-limit/`
- **THEN** issue 42's body holds the mapped Why, What Changes, Design, requirements, and acceptance criteria, and one sub-issue exists per behavior slice

#### Scenario: Change folder fails validation
- **WHEN** `openspec validate --strict` fails on the change folder itself
- **THEN** publishing stops before any issue write and prints the validation errors

### Requirement: Publishing is idempotent
Publishing the same change folder twice SHALL leave the issue body and its sub-issues unchanged after the second run. It SHALL NOT create a duplicate sub-issue.

#### Scenario: Second publish
- **WHEN** publish runs again on an unchanged change folder
- **THEN** no new sub-issue is created and the body readback matches the first publish

### Requirement: Sync completed tasks after push
A sync step SHALL read the local `tasks.md` and tick each matching checklist item in the slice sub-issue only when the commit that completed the task is reachable from the pushed remote branch. It SHALL close a slice sub-issue only when every item in its checklist is ticked. It SHALL never untick an item or reopen an issue.

#### Scenario: Category finished but not pushed
- **WHEN** every task of a slice is ticked in `tasks.md` but the branch has unpushed commits
- **THEN** sync changes no issue and reports that the branch must be pushed first

#### Scenario: Slice finished and pushed
- **WHEN** every task of a slice is ticked in `tasks.md` and the branch head is on the remote
- **THEN** sync ticks the remaining checklist items and closes that slice sub-issue

### Requirement: Issue wins after publish
After publish, the bridge SHALL treat the issue as the source of truth. When `tasks.md` names a task that the issue does not hold, sync SHALL report the task and change nothing for it.

#### Scenario: Task added locally after publish
- **WHEN** `tasks.md` gains a task that no sub-issue checklist holds
- **THEN** sync reports the task as unpublished and does not create a checklist item for it
