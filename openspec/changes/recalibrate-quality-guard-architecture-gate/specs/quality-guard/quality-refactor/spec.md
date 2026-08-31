## MODIFIED Requirements

### Requirement: measurement guards against regression
The skill SHALL record the local structural and architectural state before planning. The final plan SHALL preserve behavior and SHALL NOT leave a deterministic structural or boundary regression. An intermediate task MAY redistribute local metric counts when later tasks in the same structural unit resolve them.

#### Scenario: proposed change would add violations
- **WHEN** an extraction temporarily moves an existing violation into a new file and a later task resolves it
- **THEN** the plan keeps both tasks in one ordered structural unit and verifies the final state without regression

#### Scenario: build or tests already failing stops the run
- **WHEN** the build or test suite is already failing before the refactor starts
- **THEN** the skill stops at the initial check and reports that behavior preservation cannot be proved against a red baseline

#### Scenario: baseline recorded before planning
- **WHEN** the skill starts a new refactoring run
- **THEN** it records local metric and architecture evidence without modifying the repository's tracked quality baseline

### Requirement: scope stays within the target
The skill SHALL limit structural outcomes to the user-specified target and its necessary call sites, tests, and dependency boundary. Violations outside that scope SHALL be reported but not planned for. Large scopes SHALL be divided by responsibility and dependency-connected structural units rather than by worst-file ranking alone.

#### Scenario: out-of-scope violations reported only
- **WHEN** analysis finds violations outside the target and its necessary boundary
- **THEN** the skill lists them as informational and creates no task to repair them

#### Scenario: large scope batches the worst files first
- **WHEN** a target contains 50 or more files across several dependency-connected responsibilities
- **THEN** the skill plans bounded responsibility clusters and preserves the dependency order between them

#### Scenario: concept word argument requires user confirmation
- **WHEN** the user passes a concept word whose possible target files imply materially different scopes
- **THEN** the skill presents the candidate scope and waits for the user to select the target before planning

## ADDED Requirements

### Requirement: responsibility map drives architectural work
Before generating tasks, the skill SHALL identify responsibilities in scope, their current owners, their consumers, and their dependency edges. Scanner findings SHALL contribute evidence, but existing file boundaries SHALL NOT define the responsibility map.

#### Scenario: Existing class owns unrelated responsibilities
- **WHEN** one class contains operations and dependencies for distinct domain responsibilities
- **THEN** the skill records those responsibilities separately even when no current scanner rule fires

#### Scenario: Scanner reports local symptoms
- **WHEN** the scanner reports file length and complexity in a type with several responsibilities
- **THEN** the skill connects the symptoms to the responsibility map instead of creating independent polish tasks

### Requirement: desired ownership is defined before implementation tasks
The skill SHALL define the desired owner, directory, public boundary, and dependency direction for each responsibility being moved. It SHALL record public contracts that must remain stable and compatibility paths that must be removed. It SHALL do this before emitting implementation tasks.

#### Scenario: Responsibility needs a new module
- **WHEN** a responsibility has no focused owner in the current structure
- **THEN** the plan defines the new owner and its directory and dependency boundary before task generation

#### Scenario: Public contract must remain stable
- **WHEN** callers depend on a public contract whose implementation responsibility moves
- **THEN** the desired structure preserves the contract without retaining an unnecessary forwarding implementation

### Requirement: task boundaries follow structural outcomes
A task SHALL name a responsibility move or structural outcome. It MAY include the owner, destination, required call sites, and tests when those edits must land together to keep the repository runnable. The plan SHALL NOT create one task per existing file merely because those files exist.

#### Scenario: Extraction needs call-site migration
- **WHEN** moving a responsibility requires a new owner and updates to its callers
- **THEN** one structural task includes the extraction and necessary call-site migration

#### Scenario: Several local symptoms share one cause
- **WHEN** file length, complexity, and parameter findings all result from one misplaced responsibility
- **THEN** the plan creates the ownership move before considering any remaining local cleanup

### Requirement: architectural completion needs structural evidence
The final refactor report SHALL compare responsibility owners, dependency edges, directory placement, public surface, compatibility paths, and scanner findings before and after. It SHALL NOT call an architectural refactor complete when only names, comments, formatting, or local metrics changed.

#### Scenario: Polished structure remains unchanged
- **WHEN** implementation improves naming and local metrics but does not reach the desired ownership or boundary outcome
- **THEN** the skill reports the architectural refactor as incomplete

#### Scenario: Desired structure and behavior checks pass
- **WHEN** the final state reaches the desired ownership and boundaries, removes obsolete compatibility paths, and passes behavior-preservation checks
- **THEN** the skill reports the structural evidence and marks the refactor ready for its commit gate

## REMOVED Requirements

### Requirement: scanner drives the work, not taste
**Reason**: Scanner-first per-file planning anchors the refactor to the existing structure and cannot discover misplaced responsibilities or directory boundaries.

**Migration**: Build a responsibility and dependency map first. Use scanner findings as supporting evidence and final mechanical checks.
