## MODIFIED Requirements

### Requirement: inherits step-by-step base discipline
The skill SHALL follow the same splitting, approval, `tasks.md` persistence, staleness checks, dependency ordering, four statuses, verdict gate, repair cap, record-and-flush, closing integration, and final report as `/step-by-step`. The only substitution is the implementation dispatch mechanism.

#### Scenario: step ordering matches step-by-step
- **WHEN** tasks.md defines sequential tasks
- **THEN** the skill executes tasks in source order, the same as `/step-by-step` would

#### Scenario: branch check after solve returns
- **WHEN** solve returns and the checked-out branch differs from the session branch
- **THEN** the skill switches back to the session branch before committing

#### Scenario: commit after verified step
- **WHEN** a task's verify_cmd passes
- **THEN** the skill commits on the session branch as the base discipline requires

### Requirement: per-step mode classification
Each task in `tasks.md` SHALL be classified as `cheap` (eligible for solve dispatch) or `host-only` (must run on the host). Visual/gameplay, design/architecture, security-sensitive, and wide-scope (more than 3 files) tasks SHALL be classified as `host-only`. The classification is determined at startup and does not require a `mode` field in `tasks.md`.

#### Scenario: security-sensitive step stays on host
- **WHEN** a task involves authentication or credential handling
- **THEN** it is classified as `host-only` and dispatches to a host agent, not to `solve`

#### Scenario: visual verification stays on host
- **WHEN** a task's verify_surface is visual or gameplay
- **THEN** it is classified as `host-only` because the worker cannot see rendered output

#### Scenario: narrow step dispatches to solve
- **WHEN** a task has no security concern, no design decision, and touches 3 or fewer files
- **THEN** it is classified as `cheap`

#### Scenario: mode split reported at plan approval
- **WHEN** the plan is presented for user approval
- **THEN** the skill reports how many tasks go to cheap vs host-only
