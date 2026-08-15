# openspec-dashboard/scenario-coverage Specification

## Purpose

Shows which spec scenarios are backed by a test and names the test that proves each claim, so a reader can judge coverage without leaving the browser.

## Requirements

### Requirement: The dashboard resolves scenario-to-test bindings for a project

The dashboard SHALL resolve which scenarios in a project's spec tree are bound to tests by reading `// covers:` markers from that project's test files. It SHALL NOT run tests or spawn `dod-guard cover`. It SHALL scan markers directly, using the same marker format `dod-guard cover` uses.

#### Scenario: A project has bound and unbound scenarios

- **WHEN** the dashboard resolves bindings for a project whose spec tree has five scenarios, three of which have `// covers:` markers in test files
- **THEN** the resolver returns three bindings (each naming the scenario id, the test file, and the test name) and the remaining two scenario ids have no binding

#### Scenario: A project has no test files

- **WHEN** the dashboard resolves bindings for a project whose package directories contain no test files
- **THEN** the resolver returns zero bindings and no error

### Requirement: The spec detail API includes coverage bindings

The spec detail endpoint SHALL include a coverage map alongside the existing scenario data. The map SHALL be keyed by scenario id, and each entry SHALL carry the test file path and the test name. The spec detail endpoint SHALL also return the aggregate bound and total scenario counts so the sidebar can display them without re-counting.

#### Scenario: Spec detail response includes bindings

- **WHEN** a client requests the spec detail for a capability that has two scenarios, one bound and one not
- **THEN** the response includes a `coverage` object with one entry keyed by the bound scenario's id, carrying `testFile` and `testName`, and no entry for the unbound scenario

#### Scenario: Spec detail for a capability with no bindings

- **WHEN** a client requests the spec detail for a capability whose scenarios are all unbound
- **THEN** the response includes an empty `coverage` object

#### Scenario: Spec detail includes aggregate counts for sidebar use

- **WHEN** a client requests the spec detail for a capability with 6 scenarios, 4 bound
- **THEN** the response includes `boundCount: 4` and `totalCount: 6` alongside the coverage map

### Requirement: Coverage data is cached until the project's openspec directory changes

The dashboard SHALL cache resolved bindings for a project using the same modification-time key the other project reads use. A change to any file under the project's openspec directory or test files SHALL invalidate the cache.

#### Scenario: Bindings are served from cache on repeated requests

- **WHEN** a client requests the same spec detail twice with no file changes in between
- **THEN** the second request returns the same coverage data without re-scanning marker files
