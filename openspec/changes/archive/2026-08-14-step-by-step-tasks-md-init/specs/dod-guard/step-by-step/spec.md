## NEW Requirements

### Requirement: persistence in tasks.md
The skill SHALL read and write task state directly in `tasks.md`. Each task item is a checkbox line (`- [ ]` or `- [x]`). Metadata lives as HTML comments on lines immediately following the checkbox: `<!-- covers: ... -->` for scenario binding, `<!-- status: blocked -->` or `<!-- status: skipped -->` for non-completion states. A completed task is `- [x]`; a pending task is `- [ ]` with no status comment or `<!-- status: pending -->`. A new session SHALL resume from the first uncompleted task.

#### Scenario: session interruption and resume
- **WHEN** a session ends with the third task in progress and the first two completed
- **THEN** a new session reads `tasks.md` and resumes from the third task

#### Scenario: tasks.md line checked off with step completion
- **WHEN** a task completes verification
- **THEN** its line flips from `- [ ]` to `- [x]`

#### Scenario: skipped or blocked step stays unchecked
- **WHEN** a task is marked `skipped` or `blocked`
- **THEN** its line stays at `- [ ]` and gains a `<!-- status: blocked -->` or `<!-- status: skipped -->` comment

### Requirement: verify_cmd resolved at startup
The skill SHALL resolve each task's `verify_cmd` at startup by parsing `<!-- covers: -->` annotations and running the same cover lookup that binds scenarios to test run commands. A task whose annotation names a covered scenario gets that scenario's bound test command. A task with no annotation, or one naming an unwired or failed scenario, is `manual_required`. The skill SHALL NOT read a `steps.json` file.

#### Scenario: annotated task gets verify_cmd from cover
- **WHEN** a task's `<!-- covers: -->` annotation names a scenario that `dod-guard cover` reports as covered
- **THEN** the skill resolves that scenario's bound test run command as the task's verify_cmd

#### Scenario: unannotated task is manual
- **WHEN** a task has no `<!-- covers: -->` annotation
- **THEN** the skill treats it as manual_required and does not attempt automatic verification

## MODIFIED Requirements

### Requirement: steps.json staleness check
Before executing, the skill SHALL check whether the change's artifact statuses from `openspec status --json` have changed since the last run. It SHALL store the snapshot as a `<!-- plan_artifacts: ... -->` comment at the top of `tasks.md`. Divergence means asking the user whether to re-resolve verify_cmds.

When `tasks.md` does not exist, the skill SHALL route to `/dod-guard:interview` or `/opsx:propose`.

#### Scenario: artifact statuses diverge from snapshot
- **WHEN** the artifact statuses from `openspec status` differ from the `<!-- plan_artifacts: ... -->` snapshot in tasks.md
- **THEN** the skill asks the user whether to re-resolve verify_cmds

#### Scenario: steps.json is fresh
- **WHEN** artifact statuses match the snapshot
- **THEN** the skill resumes from the first uncompleted task without re-resolving

#### Scenario: steps.json is missing
- **WHEN** no tasks.md exists for the change
- **THEN** the skill routes to `/dod-guard:interview` or `/opsx:propose` and does not proceed

## REMOVED Requirements

### Requirement: persistence in steps.json
**Reason**: Replaced by persistence in tasks.md. The skill no longer reads or writes steps.json.
**Migration**: Existing steps.json files are ignored. Task state is read from tasks.md checkmarks and inline metadata comments.
