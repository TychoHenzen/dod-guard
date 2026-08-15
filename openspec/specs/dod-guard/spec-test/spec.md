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
