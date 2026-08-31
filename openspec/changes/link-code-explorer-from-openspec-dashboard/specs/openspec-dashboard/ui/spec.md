## ADDED Requirements

### Requirement: The selected readable project offers Code Explorer
The dashboard SHALL show one `Code Explorer` button beside `Refresh`. The action SHALL capture the selected project's registry index and registry revision when clicked. It SHALL be enabled when that snapshot entry is readable and disabled when no project is selected or the selected project is missing.

#### Scenario: Readable project is selected
- **WHEN** the active project tab identifies a readable entry in the current registry snapshot
- **THEN** the header shows an enabled `Code Explorer` button for that entry

#### Scenario: Missing project is selected
- **WHEN** the active registry entry is marked missing
- **THEN** the `Code Explorer` button is disabled and issues no launch request

#### Scenario: User switches project tabs
- **WHEN** the user selects a different readable project tab before clicking
- **THEN** the action captures the new tab's index and current registry revision

#### Scenario: Registry becomes stale
- **WHEN** launch returns `stale_project_registry`
- **THEN** the browser closes the unused placeholder, reloads projects, discards state keyed to the old revision, renders the current selection as `idle`, and does not retry without another click

#### Scenario: No project is registered
- **WHEN** the dashboard has no registered project
- **THEN** the `Code Explorer` button is disabled while project scanning remains available

### Requirement: Launch state and browser handoff remain locally bound
The browser SHALL represent each `<registry-revision>:<project-index>` snapshot as `idle`, `starting`, `open`, or `failed`. A click from `idle` or `failed` SHALL synchronously request one blank `WindowProxy` before sending launch. The request, placeholder, and response SHALL retain one immutable launch token and project snapshot even when the selected tab changes. Success SHALL navigate only that captured placeholder. Failure SHALL close the unused placeholder when possible, show the stable code beside the matching selected action, and leave retry available.

#### Scenario: Launch succeeds
- **WHEN** the user clicks the enabled action and the server returns an open URL
- **THEN** the captured state moves through `starting` to `open` and its placeholder navigates to that exact URL

#### Scenario: Launch fails
- **WHEN** the server returns a stable launch failure
- **THEN** the unused placeholder closes, the captured state becomes `failed`, and retry is available when that project is selected

#### Scenario: Browser blocks the placeholder
- **WHEN** the synchronous blank-window request returns no `WindowProxy`
- **THEN** the dashboard shows `browser_tab_blocked` and sends no launch request

#### Scenario: User closes the placeholder during startup
- **WHEN** the captured `WindowProxy.closed` is true before a successful response is applied
- **THEN** the managed child may remain open, the captured state becomes `failed` with `browser_tab_closed`, and a later click can reuse it

#### Scenario: User clicks while startup is pending
- **WHEN** the selected snapshot's state is already `starting`
- **THEN** the button is disabled and the browser sends no duplicate request

#### Scenario: Selection changes during startup
- **WHEN** the active project tab changes before an earlier launch settles
- **THEN** the late result updates only its captured snapshot and placeholder and never navigates or relabels the new selection

#### Scenario: Managed child exits after opening
- **WHEN** a later launch discovers that the recorded child exited
- **THEN** that snapshot returns to `starting` for replacement and does not reuse the stale URL

## MODIFIED Requirements

### Requirement: The view never edits anything

Every project-content control in the dashboard SHALL remain a reading control. A task's completion box SHALL be shown as a state, not as an input. The Code Explorer action MAY create and release dashboard-owned process and browser state, but dashboard code SHALL edit no file in a registered project. The launched service retains the imported read-only Code Explorer contract.

#### Scenario: Reader clicks a task's completion box
- **WHEN** the reader clicks the box drawn beside a task
- **THEN** nothing is written and the task's state does not change

#### Scenario: Reader launches Code Explorer
- **WHEN** the reader starts or reuses Code Explorer for the selected project
- **THEN** dashboard code changes only managed launch and browser state and writes no file in that project
