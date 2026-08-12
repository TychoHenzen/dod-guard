## Purpose

Gets a project's OpenSpec data by running the OpenSpec CLI and parsing its
JSON output. Everything the dashboard shows arrives through this path, so the
dashboard and the CLI can never report different numbers for the same project.

## ADDED Requirements

### Requirement: The reader runs read commands only

The reader SHALL run only OpenSpec commands that report state: listing changes,
listing specs, showing a change, showing a spec, and reporting a change's
artifact status. It SHALL NOT run a command that edits a file, including
archive, sync and apply. It SHALL NOT write to any path inside a project.

#### Scenario: Rendering a change
- **WHEN** the dashboard renders a change
- **THEN** it runs only reporting commands and the project's files are
  unchanged afterwards

#### Scenario: A command outside the allowed set
- **WHEN** something asks the reader to run a command that is not in the
  allowed set
- **THEN** the reader refuses and runs nothing

### Requirement: The reader locates the CLI without a fixed path

The reader SHALL find the OpenSpec CLI at startup. It SHALL prefer an explicit
path given in the environment. Failing that, it SHALL resolve the CLI from the
launcher on the system search path. It SHALL NOT depend on a path written into
the source.

#### Scenario: Explicit path given
- **WHEN** the environment names the CLI's entry file
- **THEN** the reader uses that file and does not search the system path

#### Scenario: No explicit path
- **WHEN** the environment names nothing and the CLI is installed
- **THEN** the reader resolves the CLI from the launcher on the search path

#### Scenario: CLI cannot be located
- **WHEN** neither route finds the CLI
- **THEN** the dashboard refuses to start and names the environment variable
  that would fix it

### Requirement: A failed read is reported, not swallowed

A CLI run that fails SHALL produce a message the reader sees in the browser.
The message SHALL name what failed. It SHALL NOT leave a blank pane, and SHALL
NOT stop the rest of the dashboard from working.

#### Scenario: CLI exits non-zero
- **WHEN** a command exits non-zero
- **THEN** the affected pane shows a message naming the failing command, and
  the other projects still open

#### Scenario: Output is not valid JSON
- **WHEN** a command succeeds but its output does not parse as JSON
- **THEN** the pane reports a read failure rather than rendering nothing

### Requirement: A result is reused until the project changes

The reader SHALL reuse a previous result for the same project and command while
that project's OpenSpec files are unchanged. It SHALL detect a change by the
newest modification time under the project's `openspec/` directory. A reader
SHALL also honour an explicit refresh that discards what it holds.

#### Scenario: Second load with no edit
- **WHEN** the same view is loaded twice and no file changed in between
- **THEN** the second load runs no new CLI command

#### Scenario: A spec file was edited
- **WHEN** a file under the project's `openspec/` directory is modified
- **THEN** the next load runs the command again and shows the new content

#### Scenario: Reader asks for a refresh
- **WHEN** the reader explicitly requests a refresh for a project
- **THEN** the reader discards what it holds for that project and runs the
  commands again

### Requirement: Task detail is read from the change's task file

No reporting command returns the text of an individual task, so the reader
SHALL read the change's task file directly. It SHALL group tasks under their
section heading. It SHALL preserve each task's checked state and its
identifier.

#### Scenario: Task file with sections
- **WHEN** a change's task file holds checkbox items under numbered section
  headings
- **THEN** the reader returns the tasks grouped by section, each carrying its
  identifier, text and checked state

#### Scenario: Change has no task file
- **WHEN** a change holds no task file
- **THEN** the change still renders and its task list is reported as absent

#### Scenario: Completed and pending tasks together
- **WHEN** a task file mixes checked and unchecked items
- **THEN** each item keeps the state its file records

### Requirement: A command runs only in a registered project

The reader SHALL run a command only in a directory the registry lists. A
project SHALL be addressed by its position in the registry rather than by a
path supplied with the request.

#### Scenario: Request names an unknown project
- **WHEN** a request identifies a project the registry does not hold
- **THEN** the request is rejected and no command runs

#### Scenario: Request supplies a directory path
- **WHEN** a request carries a directory path of its own
- **THEN** the path is ignored and the registry entry decides where the command
  runs
