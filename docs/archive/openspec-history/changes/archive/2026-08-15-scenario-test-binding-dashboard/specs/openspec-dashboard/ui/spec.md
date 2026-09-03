## MODIFIED Requirements

### Requirement: A spec opens down to its scenarios

Selecting a spec SHALL show its purpose text and every requirement it holds.
Each requirement SHALL be openable to reveal its scenarios, with the WHEN and
THEN lines readable as written. Each scenario SHALL display a coverage indicator: a bound scenario SHALL show the test name that proves its claim, and an unbound scenario SHALL show that no test binds it.

#### Scenario: Spec selected

- **WHEN** the reader selects a spec
- **THEN** the pane shows the spec's purpose and lists every requirement in it

#### Scenario: Requirement opened

- **WHEN** the reader opens a requirement
- **THEN** its scenarios appear, each showing its WHEN and THEN lines

#### Scenario: A bound scenario shows its test name

- **WHEN** the reader opens a requirement that contains a scenario bound to a test via a `// covers:` marker
- **THEN** that scenario's row displays the name of the test that proves its claim

#### Scenario: An unbound scenario shows no test

- **WHEN** the reader opens a requirement that contains a scenario with no `// covers:` marker in any test file
- **THEN** that scenario's row displays an indicator that no test binds it

#### Scenario: A requirement summary shows its coverage count

- **WHEN** the reader views a requirement that has four scenarios, two of which are bound
- **THEN** the requirement's collapsed summary displays "2/4 bound"

#### Scenario: The spec header shows total coverage across all requirements

- **WHEN** the reader opens a spec with three requirements totaling ten scenarios, four of which are bound
- **THEN** the spec header displays "4/10 scenarios bound"
