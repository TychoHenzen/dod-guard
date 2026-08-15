## MODIFIED Requirements

### Requirement: A scenario binds to a test through a marker in the test file

`dod-guard cover` SHALL bind a scenario to a test by reading a `covers:` comment
placed directly above a test declaration in a test file, not by matching a
scenario title against a test title. The comment prefix and the test declaration
pattern SHALL be determined by the file's extension:

| Extension | Comment prefix | Test declaration |
|-----------|---------------|------------------|
| `.ts`, `.js`, `.mjs`, `.cjs` | `//` | `test(` or `it(` |
| `.py` | `#` | `def test_` |
| `.go` | `//` | `func Test` |
| `.rs` | `//` | `fn ` preceded by `#[test]` on the previous non-blank line |
| `.rb` | `#` | `def test_` or `it ` or `it(` |
| `.java`, `.kt` | `//` | `void test` or `fun test` (case-insensitive `test` prefix) or `@Test` on the previous non-blank line followed by a method declaration |
| `.sh`, `.bash` | `#` | a function whose name starts with `test_` |

Files whose extension is not in this table SHALL be skipped without error.

#### Scenario: A test file carries a covers marker above a test call

- **WHEN** a test file has a covers marker comment on the line directly above a
  test declaration, using the comment prefix and test pattern that match the
  file's extension
- **THEN** `dod-guard cover` binds that scenario id to that declaration's test
  name and file path

#### Scenario: A marker with no test call after it binds nothing

- **WHEN** a covers marker comment is followed by blank lines and then
  end-of-file, or by a line that is not a test declaration for that file type
- **THEN** `dod-guard cover` binds nothing for that marker, and the scenario
  it named is reported the same as if the marker were never written

#### Scenario: A Python test file carries a covers marker above def test_

- **WHEN** a `.py` file has `# covers: eval/events :: R7 :: S1` on the line
  directly above `def test_probe_truth_difficulty_defaults_to_none():`
- **THEN** `dod-guard cover` binds scenario id
  `eval/events::R7||S1` to test name
  `test_probe_truth_difficulty_defaults_to_none` and that file's path

#### Scenario: A Go test file carries a covers marker above func Test

- **WHEN** a `.go` file has `// covers: mygroup/mycap :: Req1 :: Scen1` on the
  line directly above `func TestSomething(t *testing.T) {`
- **THEN** `dod-guard cover` binds the scenario to test name `TestSomething`
  and that file's path

#### Scenario: An unknown file extension is silently skipped

- **WHEN** `dod-guard cover` encounters a file with an extension not in the
  supported table (e.g. `.txt`, `.md`, `.csv`)
- **THEN** the scanner skips the file without error and does not attempt to
  parse markers from it

## ADDED Requirements

### Requirement: Test-file discovery is configurable per project

`dod-guard cover` SHALL resolve the set of test files to scan for a group by
reading `openspec/test-globs.json` at the project root. When the file does not
exist or does not contain an entry for the group, the scanner SHALL fall back to
the built-in globs (the current behavior).

#### Scenario: A project provides test-globs.json with a group entry

- **WHEN** `openspec/test-globs.json` exists at the project root and contains
  `{"eval": ["src/eval/**/*_test.py", "tests/eval/**/*.py"]}`
- **AND** `dod-guard cover` scans for group `eval`
- **THEN** the scanner uses those glob patterns to find test files for that group

#### Scenario: A project has no test-globs.json

- **WHEN** `openspec/test-globs.json` does not exist at the project root
- **AND** `dod-guard cover` scans for group `dod-guard`
- **THEN** the scanner uses the built-in glob `packages/dod-guard/src/**/*.test.ts`

#### Scenario: test-globs.json exists but has no entry for the group

- **WHEN** `openspec/test-globs.json` exists but contains no key for group `foo`
- **AND** `dod-guard cover` scans for group `foo`
- **THEN** the scanner uses the built-in glob `packages/foo/src/**/*.test.ts`

#### Scenario: test-globs.json contains an invalid entry

- **WHEN** `openspec/test-globs.json` exists and the value for a group is not
  an array of strings
- **THEN** `dod-guard cover` exits with the usage-error code and names the
  malformed key
