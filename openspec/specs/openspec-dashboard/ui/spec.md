# OpenSpec Dashboard UI Specification

## Purpose

What a reader can see and reach in the browser. Projects sit in tabs, each tab
lists that project's changes and specs, and a detail pane opens either one down
to the level `openspec view` never reaches: the individual requirement and its
scenarios.
## Requirements
### Requirement: The dashboard is served locally and says where

The dashboard SHALL listen on the loopback interface only. It SHALL print the
address it is listening on when it starts. When its preferred port is taken it
SHALL choose another and print that one.

#### Scenario: Normal start
- **WHEN** the dashboard starts and its preferred port is free
- **THEN** it listens on the loopback interface and prints the address

#### Scenario: Preferred port is taken
- **WHEN** another process already holds the preferred port
- **THEN** the dashboard starts on a different port and prints that address

### Requirement: Each registered project is a tab

The dashboard SHALL show one tab per registered project. Exactly one tab SHALL
be selected at a time. Selecting a tab SHALL show that project's content
without disturbing the others.

#### Scenario: Two registered projects
- **WHEN** the registry holds two projects
- **THEN** the tab bar shows both, and one of them is selected

#### Scenario: Switching tabs
- **WHEN** the reader selects a different tab
- **THEN** the sidebar and detail pane show the newly selected project

#### Scenario: Reaching the scan panel
- **WHEN** the reader opens the scan control in the tab bar
- **THEN** the scan panel opens and offers the candidates it found

### Requirement: The sidebar lists a project's changes and specs

The sidebar SHALL list the project's active changes and its specs as two
groups. A change SHALL show its completed and total task counts. A spec SHALL
show its requirement count. A filter SHALL narrow both groups by name.

#### Scenario: Counts agree with the CLI
- **WHEN** a project is selected
- **THEN** the number of specs and active changes listed matches what the
  OpenSpec CLI reports for that project

#### Scenario: Filtering
- **WHEN** the reader types into the filter
- **THEN** both groups show only the entries whose name matches

#### Scenario: Project with no active change
- **WHEN** a project holds specs but no active change
- **THEN** the changes group states that none are active and the specs still
  list

### Requirement: A spec opens down to its scenarios

Selecting a spec SHALL show its purpose text and every requirement it holds. Each requirement SHALL be openable to reveal its scenarios, with the WHEN and THEN lines readable as written. Each scenario SHALL display a coverage indicator: a bound scenario SHALL show the test name as a clickable foldout that reveals the test body, and an unbound scenario SHALL show that no test binds it.

#### Scenario: Spec selected

- **WHEN** the reader selects a spec
- **THEN** the pane shows the spec's purpose and lists every requirement in it

#### Scenario: Requirement opened

- **WHEN** the reader opens a requirement
- **THEN** its scenarios appear, each showing its WHEN and THEN lines

#### Scenario: A bound scenario shows its test name

- **WHEN** the reader opens a requirement that contains a scenario bound to a test via a `// covers:` marker
- **THEN** that scenario's row displays the test name inside a collapsed `<details>` summary element

#### Scenario: Clicking the foldout reveals the test body

- **WHEN** the reader clicks the test name foldout on a bound scenario
- **THEN** the foldout expands and shows the test function's source code in a `<pre><code>` block

#### Scenario: An unbound scenario shows no test

- **WHEN** the reader opens a requirement that contains a scenario with no `// covers:` marker in any test file
- **THEN** that scenario's row displays an indicator that no test binds it

#### Scenario: A requirement summary shows its coverage count

- **WHEN** the reader views a requirement that has four scenarios, two of which are bound
- **THEN** the requirement's collapsed summary displays "2/4 bound"

#### Scenario: The spec header shows total coverage across all requirements

- **WHEN** the reader opens a spec with three requirements totaling ten scenarios, four of which are bound
- **THEN** the spec header displays "4/10 scenarios bound"

### Requirement: A change opens to its progress, deltas and tasks

Selecting a change SHALL show its task progress as completed out of total. It
SHALL show each planning artifact with the state the CLI reports for it. It
SHALL list the change's spec deltas grouped by the spec they target, each
labelled with its operation. It SHALL list the change's tasks grouped by
section.

#### Scenario: Change selected
- **WHEN** the reader selects an active change
- **THEN** the pane shows its task progress, its artifact states, its deltas
  and its tasks

#### Scenario: Deltas grouped by target
- **WHEN** a change holds deltas against more than one spec
- **THEN** the deltas are grouped under the spec they target and each shows
  whether it adds, modifies, removes or renames a requirement

#### Scenario: Task state is shown as recorded
- **WHEN** a change's task file holds both completed and pending tasks
- **THEN** each task is drawn in the state the file records

### Requirement: The view never edits anything

Every project-content control in the dashboard SHALL remain a reading control. A task's completion box SHALL be shown as a state, not as an input. The Code Explorer action MAY create and release dashboard-owned process and browser state, but dashboard code SHALL edit no file in a registered project. The launched service retains the imported read-only Code Explorer contract.

#### Scenario: Reader clicks a task's completion box
- **WHEN** the reader clicks the box drawn beside a task
- **THEN** nothing is written and the task's state does not change

#### Scenario: Reader launches Code Explorer
- **WHEN** the reader starts or reuses Code Explorer for the selected project
- **THEN** dashboard code changes only managed launch and browser state and writes no file in that project

### Requirement: An empty or broken project still renders

A project holding no specs, no changes, or neither SHALL still open and SHALL
say what is absent. A project the registry lists but cannot be read SHALL show
the reason in its own tab.

#### Scenario: Project with nothing in it
- **WHEN** a registered project holds no specs and no changes
- **THEN** its tab opens and states that both are empty

#### Scenario: Project that cannot be read
- **WHEN** a registered project is missing or fails to read
- **THEN** its tab shows the reason and the other tabs still work

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

