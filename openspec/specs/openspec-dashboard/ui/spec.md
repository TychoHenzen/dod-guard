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

Every control in the dashboard SHALL be a reading control. A task's completion
box SHALL be shown as a state, not as an input. No control SHALL edit a file in
a project.

#### Scenario: Reader clicks a task's completion box
- **WHEN** the reader clicks the box drawn beside a task
- **THEN** nothing is written and the task's state does not change

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

