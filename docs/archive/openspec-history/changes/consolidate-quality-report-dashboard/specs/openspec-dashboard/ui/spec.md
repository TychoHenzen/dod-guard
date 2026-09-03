## ADDED Requirements

### Requirement: A project exposes a structured Quality view
Each registered project SHALL offer a Quality entry. The view SHALL read `.quality/quality-report.json` from that project and show overall, production, and test summaries, filterable rule groups, file-level details, and separate placement, dependency, cycle, and encapsulation sections.

Artifact-derived paths, rules, messages, symbols, evidence, and errors SHALL be rendered as text nodes. They SHALL NOT be inserted as HTML, inline handlers, executable URLs, or other script-bearing DOM content.

Before every artifact read, the dashboard SHALL resolve the registered project root and artifact path. It SHALL reject a `.quality` directory or artifact that is a symbolic link, junction, reparse point, or resolves outside that root.

#### Scenario: Valid quality artifact is opened
- **WHEN** the reader selects Quality for a project with a valid artifact
- **THEN** the detail pane shows its summaries, grouped findings, file details, and cross-file appendix

#### Scenario: Reader filters quality findings
- **WHEN** the reader filters by text, severity, classification, or rule
- **THEN** the visible groups and files contain only matching findings without changing the artifact

Text matching SHALL be case-insensitive substring matching over file path, rule, and message. Severity accepts `all`, `error`, or `warn`; classification accepts `all`, `production`, or `test`; rule accepts `all` or one rule present in the loaded report. Active filters combine with logical AND. A zero-match result SHALL show an explicit empty state.

#### Scenario: Quality artifact is missing
- **WHEN** the selected project has no `.quality/quality-report.json`
- **THEN** the view says the artifact is missing and offers Regenerate

#### Scenario: Artifact text contains markup
- **WHEN** an artifact field contains HTML or script syntax
- **THEN** the view displays the literal text and executes nothing

#### Scenario: Artifact read escapes through filesystem indirection
- **WHEN** `.quality` or its report is linked or resolves outside the registered project root
- **THEN** the view rejects the artifact and reads no content from the resolved target

### Requirement: Regenerate and Reload are distinct actions
Regenerate SHALL invoke the bundled external report generator with the selected registry project's resolved root as one argument and that root as its working directory, using the current Node executable, a clean fixed argument list, a 120-second timeout, and no shell. The API SHALL accept only the registry index, never a client-supplied path. A launch error, timeout, nonzero exit, or invalid resulting artifact SHALL be a regeneration failure. Reload SHALL only reread the existing artifact. Opening Quality and refreshing ordinary project data SHALL NOT regenerate the report.

Every state-changing dashboard request SHALL require an unguessable per-process token supplied by the dashboard page and a same-origin `Origin` header. The server SHALL reject missing or mismatched tokens, foreign origins, and project identifiers that do not resolve through the registry.

#### Scenario: Reader regenerates quality evidence
- **WHEN** the reader selects Regenerate and generation succeeds
- **THEN** the dashboard loads the newly written artifact for that same registered project

#### Scenario: Reader reloads quality evidence
- **WHEN** the artifact changed outside the dashboard and the reader selects Reload
- **THEN** the dashboard displays the changed valid artifact without running generation

#### Scenario: Generation fails
- **WHEN** Regenerate returns an error
- **THEN** the view displays that error and retains the last valid displayed report and artifact

#### Scenario: Generation fails before any valid report was displayed
- **WHEN** Regenerate fails and the view has no prior valid report
- **THEN** the view shows an error and an empty unavailable state without inventing report data

#### Scenario: Reload finds an invalid artifact
- **WHEN** Reload reads malformed or unsupported report data
- **THEN** the view displays a validation error and retains the last valid displayed report

#### Scenario: Foreign page requests regeneration
- **WHEN** a state-changing request lacks the session token, has a foreign Origin, or names no registered project
- **THEN** the server rejects it before launching the generator or writing a file

## MODIFIED Requirements

### Requirement: The view never edits anything

Every ordinary dashboard control SHALL be a reading control. A task's completion box SHALL be shown as a state, not as an input. No control SHALL edit OpenSpec artifacts or source files. The Code Explorer action MAY create and release dashboard-owned process and browser state, but dashboard code SHALL edit no file in a registered project. The launched service retains the imported read-only Code Explorer contract. The explicit Quality Regenerate control MAY invoke the external generator, whose only project write is `.quality/quality-report.json`.

#### Scenario: Reader clicks a task's completion box
- **WHEN** the reader clicks the box drawn beside a task
- **THEN** nothing is written and the task's state does not change

#### Scenario: Reader launches Code Explorer
- **WHEN** the reader starts or reuses Code Explorer for the selected project
- **THEN** dashboard code changes only managed launch and browser state and writes no file in that project

#### Scenario: Reader uses ordinary navigation or refresh
- **WHEN** the reader opens projects, specs, changes, Quality, or the ordinary Refresh control
- **THEN** no project file is written

#### Scenario: Reader explicitly regenerates the quality report
- **WHEN** the reader selects Regenerate for Quality
- **THEN** the external generator may replace only `.quality/quality-report.json` in that registered project

### Requirement: Unsupported projects remain readable
Quality SHALL show an unavailable state when a registered project is missing, inaccessible, read-only, or unsupported by the bundled generator. Other OpenSpec views and registered projects SHALL remain usable.

#### Scenario: Registered project cannot generate a report
- **WHEN** Quality opens for a missing, inaccessible, read-only, or unsupported project
- **THEN** the view names the unavailable condition without attempting another project path
