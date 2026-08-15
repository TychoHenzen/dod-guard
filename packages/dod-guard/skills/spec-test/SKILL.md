---
name: spec-test
description: >-
  Generate tests for uncovered OpenSpec scenarios using the spec's WHEN/THEN
  contract as the sole source of expected values, not the implementation.
  Detects and reports contradictions between spec and implementation instead of
  silently adjusting assertions. TRIGGER when: user says "write tests from the
  spec", "test this spec", "generate spec tests", "make tests for this
  capability", "cover these scenarios", or "test these requirements". DO NOT
  TRIGGER for auditing existing tests (that is /test-integrity-checker),
  expanding a spec (that is /spec-explore), or writing tests without a spec
  target (use the project's normal test workflow).
argument-hint: "<capability-path> [requirement name]"
---

# Spec Test

Generate one test per scenario in an OpenSpec spec, deriving every assertion
from the scenario's WHEN/THEN contract. Never read the implementation to
determine expected values.

## Input

The user provides:
- A capability path under `openspec/specs/` (required)
- An optional requirement name to narrow scope to that requirement's scenarios

If the user asks for edge-case tests beyond what the spec states, respond that
edge cases belong in the spec first and recommend running `/spec-explore`.

## Constraints

These constraints exist because LLMs writing tests after the code tend to
record what the code does rather than what the spec requires. A test that
mirrors a buggy implementation passes and proves nothing.

1. **Read the spec, not the implementation, for expected values.** Every
   assertion in a generated test must trace to a THEN clause in the spec. If
   the spec says "returns an empty array", assert an empty array, even if the
   implementation returns null.

2. **Do not call the implementation to capture output and assert on it.** That
   is output blessing. The test must assert the spec's stated outcome.

3. **Do not read implementation source to determine what the function returns,
   throws, or logs.** Read only enough of the implementation to know the
   function's name, its module path, and how to call it (parameter types and
   import path). Nothing else from the implementation enters the test.

4. **Do not invent scenarios.** Generate exactly one test per scenario in the
   targeted spec or requirement. No more.

5. **When a scenario is too vague to derive assertions, say so.** A scenario
   that says "THEN the system handles the error" has no testable claim. Report
   which scenario is vague and what detail is missing. Do not guess.

## Steps

1. Read the spec at `openspec/specs/<capability-path>/spec.md`. Extract every
   requirement and its scenarios. If the user named a requirement, keep only
   that requirement's scenarios.

2. Detect the project's test framework and conventions by reading two or three
   existing test files. Note: the test runner (`node:test`, Jest, Vitest,
   etc.), the assertion library (`node:assert`, `expect`, etc.), the file
   naming convention (`*.test.ts`, `*.spec.ts`, etc.), and the test structure
   (`describe`/`it`, `test()`, etc.).

3. Identify the module under test. The first path segment of the capability
   path names the package group. Read only enough of the implementation to
   find: the file that exports the function or class, the import path, and the
   function signature (name + parameter types). Stop there. Do not read the
   function body. Do not read what it returns or throws.

4. For each scenario, write one test:
   - The test name includes the scenario name
   - The WHEN clause becomes the test's setup and invocation
   - The THEN clause becomes the assertion
   - Add a `covers:` marker on the line directly above the test declaration,
     never inside the function body. Use the comment prefix for the file's
     language: `//` for JS/TS/Go/Rust/Java/Kotlin, `#` for Python/Ruby/Shell.
     Format: `<prefix> covers: <group>/<capability> :: <requirement title> :: <scenario title>`

5. Write the test file to the appropriate location following the project's
   naming convention.

6. Run the tests.

7. For each failing test, report the contradiction:
   - Quote the spec's expected behavior (the THEN clause)
   - Quote the implementation's actual behavior (the assertion failure message)
   - Ask the user: "The spec says X. The implementation does Y. Which is wrong?"
   - Do NOT change the test to match the implementation

8. For each passing test, report it passed.

## Output format

Print a summary:
- Number of tests generated
- Number passing
- Number failing, with the contradiction report for each

If all tests pass, the implementation agrees with the spec on every scenario
tested.

Print a coverage summary, scoped to the targeted capability or, when the user
named one, the targeted requirement:
- Total scenarios in scope
- Covered count, broken down into pre-existing (already had a `covers:`
  marker before this run) and newly generated (covered by a test written in
  this run)
- Uncovered count (scenarios in scope with no `covers:` marker after this
  run, including any this run could not generate a test for per step 5 of
  the Constraints)
- Coverage percentage: covered / total scenarios in scope
