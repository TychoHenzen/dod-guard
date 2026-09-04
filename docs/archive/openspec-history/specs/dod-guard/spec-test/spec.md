# dod-guard/spec-test Specification

## Purpose

Generates tests for uncovered spec scenarios using adversarial techniques that derive expected behavior from the spec, not from the current implementation, so that implementation bugs are caught rather than blessed.
## Requirements
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

### Requirement: The skill warns when spec and implementation contradict

After generating tests from the spec, the skill SHALL run them. When a test fails, the skill SHALL report the contradiction: the spec says X, the implementation does Y. It SHALL NOT silently change the test to match the implementation.

#### Scenario: Generated test fails because implementation disagrees with spec
- **WHEN** a generated test asserts the spec's stated behavior and the implementation produces a different result
- **THEN** the skill reports the failing test, quotes the spec's expected behavior, quotes the implementation's actual behavior, and asks the user whether the spec or the implementation is wrong

### Requirement: The skill covers the stated spec scenarios, not invented ones

The skill SHALL generate one test per scenario in the targeted spec or requirement. It SHALL NOT invent scenarios beyond what the spec states. If the user wants more scenarios, the skill SHALL direct them to `/spec-explore` first.

#### Scenario: Spec has four scenarios
- **WHEN** the user runs `/spec-test` against a spec with four scenarios
- **THEN** the skill generates exactly four test cases, one per scenario

#### Scenario: User asks for edge-case tests
- **WHEN** the user asks the skill to also cover edge cases not in the spec
- **THEN** the skill responds that edge cases belong in the spec first and recommends running `/spec-explore`

### Requirement: Generated tests use the project's test framework and conventions

The skill SHALL detect the project's test runner, assertion style, and file naming convention by reading existing test files. Generated tests SHALL follow those conventions.

#### Scenario: Project uses Node native test runner with assert
- **WHEN** the project's existing tests use `node:test` and `node:assert`
- **THEN** the generated tests import from `node:test` and `node:assert` and follow the same describe/it or test() pattern

### Requirement: The skill targets a specific requirement when asked

The skill SHALL accept an optional requirement name to narrow its scope. When given, it SHALL generate tests only for that requirement's scenarios.

#### Scenario: User targets a single requirement
- **WHEN** the user runs `/spec-test` with both a capability path and a requirement name
- **THEN** the skill generates tests only for scenarios under that requirement

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

