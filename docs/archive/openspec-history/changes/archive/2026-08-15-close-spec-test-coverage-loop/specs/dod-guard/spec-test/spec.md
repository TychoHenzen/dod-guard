## ADDED Requirements

### Requirement: Generated tests carry a covers marker that binds them to the spec scenario

The `/spec-test` skill SHALL place a `covers:` comment on the line directly above every test declaration it generates. The comment SHALL use the format that `dod-guard cover` already parses: `<comment-prefix> covers: <group>/<capability> :: <requirement title> :: <scenario title>`. The comment prefix and test declaration pattern SHALL follow the `LanguageSpec` table in `dod-guard/coverage-gate`.

#### Scenario: A generated TypeScript test carries a covers marker

- **WHEN** `/spec-test` generates a test for scenario "Successful export" under requirement "User can export data" in capability `mygroup/data-export`
- **THEN** the test file contains `// covers: mygroup/data-export :: User can export data :: Successful export` on the line directly above the `test()` or `it()` call

#### Scenario: A generated Python test carries a covers marker

- **WHEN** `/spec-test` generates a `.py` test for scenario "Empty input returns nothing" under requirement "Parser handles edge cases" in capability `mygroup/parser`
- **THEN** the test file contains `# covers: mygroup/parser :: Parser handles edge cases :: Empty input returns nothing` on the line directly above the `def test_` declaration

#### Scenario: The marker uses the scenario's exact title from the spec

- **WHEN** a spec scenario is titled "A marker with no test call after it binds nothing"
- **THEN** the generated `covers:` marker uses that exact title, not a shortened or reformatted version

### Requirement: The coverage summary shows totals, not just gaps

After running the generated tests, the `/spec-test` skill SHALL print a coverage summary that reports the total number of scenarios in the targeted spec or requirement, the number now covered by a `covers:` marker in a test file, the number still uncovered, and the percentage covered. The summary SHALL NOT report only the uncovered list without a denominator.

#### Scenario: Coverage summary after generating tests for a spec with 23 scenarios

- **WHEN** `/spec-test` generates tests for a capability whose spec has 23 scenarios and 9 already had `covers:` markers before this run
- **THEN** the summary reports: 23 total scenarios, 23 covered (9 pre-existing + 14 newly generated), 0 uncovered, 100% covered

#### Scenario: Coverage summary when targeting a single requirement

- **WHEN** `/spec-test` targets a single requirement with 4 scenarios inside a capability that has 23 scenarios total
- **THEN** the summary scopes its count to that requirement: 4 total scenarios, 4 covered, 0 uncovered, 100% covered

## MODIFIED Requirements

### Requirement: The skill generates tests from the spec, not from the implementation

The `/spec-test` skill SHALL accept a capability path. It SHALL read the spec's requirements and scenarios. It SHALL generate test cases whose assertions are derived from the scenario's WHEN/THEN contract. The skill SHALL NOT read the implementation source to determine expected values. It SHALL NOT call the implementation to capture its current output and assert on that output.

#### Scenario: A test asserts the spec's stated outcome, not the code's actual output
- **WHEN** a spec scenario says "THEN the function returns an empty array" and the implementation currently returns null
- **THEN** the generated test asserts an empty array, not null

#### Scenario: The skill refuses to generate a test when the scenario is too vague to derive assertions
- **WHEN** a spec scenario says "THEN the system handles the error" with no further detail
- **THEN** the skill reports that the scenario is not specific enough to generate a meaningful test, and names what is missing

#### Scenario: The skill reads the implementation only for call signature, not behavior
- **WHEN** the skill identifies the module under test
- **THEN** it reads only the function name, parameter types, and import path from the implementation, and does not read the function body or its return values
