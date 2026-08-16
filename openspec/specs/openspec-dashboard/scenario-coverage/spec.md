# openspec-dashboard/scenario-coverage Specification

## Purpose

Shows which spec scenarios are backed by a test and names the test that proves each claim, so a reader can judge coverage without leaving the browser.
## Requirements
### Requirement: The dashboard resolves scenario-to-test bindings for a project

The dashboard SHALL resolve which scenarios in a project's spec tree are bound to tests by reading `// covers:` markers from that project's test files. It SHALL NOT run tests or spawn `dod-guard cover`. It SHALL scan markers directly, using the same marker format `dod-guard cover` uses. Each binding SHALL include the test body text: the source lines from the test declaration through the end of the test function.

#### Scenario: A project has bound and unbound scenarios

- **WHEN** the dashboard resolves bindings for a project whose spec tree has five scenarios, three of which have `// covers:` markers in test files
- **THEN** the resolver returns three bindings, each naming the scenario id, the test file, the test name, and the test body text, and the remaining two scenario ids have no binding

#### Scenario: A project has no test files

- **WHEN** the dashboard resolves bindings for a project whose package directories contain no test files
- **THEN** the resolver returns zero bindings and no error

### Requirement: The spec detail API includes coverage bindings

The spec detail endpoint SHALL include a coverage map alongside the existing scenario data. The map SHALL be keyed by scenario id, and each entry SHALL carry the test file path, the test name, and the test body text. The spec detail endpoint SHALL also return the aggregate bound and total scenario counts so the sidebar can display them without re-counting.

#### Scenario: Spec detail response includes bindings

- **WHEN** a client requests the spec detail for a capability that has two scenarios, one bound and one not
- **THEN** the response includes a `coverage` object with one entry keyed by the bound scenario's id, carrying `testFile`, `testName`, and `testBody`, and no entry for the unbound scenario

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

### Requirement: The test body extraction covers brace-delimited and indentation-delimited languages

The marker scanner SHALL extract the test body by reading forward from the test declaration line. For brace-delimited languages (TypeScript, JavaScript, Go, Rust, Java, Kotlin, shell), it SHALL track brace nesting depth and stop when the depth returns to zero. For indentation-delimited languages (Python, Ruby `def`), it SHALL stop when a non-blank line appears at the same or lesser indentation as the declaration. The extracted body SHALL include the declaration line itself.

#### Scenario: Brace-delimited test body extraction

- **WHEN** the scanner reads a TypeScript test file containing a `// covers:` marker above a `test("name", () => { ... })` spanning four lines
- **THEN** the binding's `testBody` contains all four lines from the `test(` declaration through the closing `});`

#### Scenario: Indentation-delimited test body extraction

- **WHEN** the scanner reads a Python test file containing a `# covers:` marker above a `def test_something():` whose body is indented four spaces over three lines
- **THEN** the binding's `testBody` contains the `def` line and the three indented body lines

#### Scenario: Test body with nested braces

- **WHEN** the scanner reads a test containing inner blocks (if/for/try) that add nested brace pairs
- **THEN** the binding's `testBody` includes all lines through the outermost closing brace of the test function

### Requirement: The spec detail view shows an obligation delta per requirement

The spec detail view SHALL display an obligation delta chip next to each
requirement's existing bound/total coverage chip. The chip SHALL show the count
of uncovered obligations (obligation keywords minus scenario count). The chip
SHALL appear only when the delta is greater than zero.

#### Scenario: A requirement with positive obligation delta

- **WHEN** the spec detail view renders a requirement whose body has 5
  obligation keywords and 2 scenarios
- **THEN** the view shows a chip reading `3 uncovered` styled as a warning

#### Scenario: A requirement with zero or negative delta

- **WHEN** the spec detail view renders a requirement whose obligation count
  equals or is less than its scenario count
- **THEN** no obligation delta chip appears for that requirement

### Requirement: The spec detail API includes obligation counts per requirement

The spec detail endpoint SHALL include an `obligationCount` field on each
requirement alongside the existing scenario data. The field SHALL hold the
count of RFC 2119 obligation keywords in that requirement's body text.

#### Scenario: Spec detail response includes obligation counts

- **WHEN** a client requests the spec detail for a capability with two
  requirements, the first having 4 obligation keywords and the second having 1
- **THEN** the response includes `obligationCount: 4` on the first requirement
  and `obligationCount: 1` on the second

