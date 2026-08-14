## MODIFIED Requirements

### Requirement: requires a confirmed OpenSpec change id
The skill SHALL NOT gather requirements or write spec deltas. It requires an existing, confirmed OpenSpec change id with `tasks.md` already written. When no change id is provided, the skill SHALL route to `/interview` or `/opsx:propose`.

#### Scenario: no change id provided
- **WHEN** the user invokes `/ratchet` without a change id
- **THEN** the skill routes to `/interview` to gather requirements first

#### Scenario: change id provided but steps.json missing
- **WHEN** the user provides a change id and no tasks.md exists for it
- **THEN** the skill routes to `/opsx:propose` or `/interview` to create the task list first

#### Scenario: change id with existing steps.json
- **WHEN** the user provides a change id and a valid tasks.md already exists
- **THEN** the skill reads the prior state from tasks.md and resumes from the first uncompleted task
