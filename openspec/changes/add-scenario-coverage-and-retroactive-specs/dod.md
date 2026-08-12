# add-scenario-coverage-and-retroactive-specs - Requirements Spec

<claude_instructions>
**For the implementer:** Work through each task below.
1. Mark a task `[>]` when you begin working on it.
2. Call `dod_check` to verify proofs - do NOT mark proofs manually.
3. A task group is complete when ALL its concrete proofs pass via `dod_check`.
4. Use `dod_refine` to turn a draft leaf into a concrete proof or subdivide into child tasks.
5. If a proof cannot be met, use `dod_amend` to modify it with a reason.
6. Continue until `dod_check` returns PASS - then stop and report done.

**Behavioral predicates only.** Each proof is a concrete behavioral claim.
Read failure diagnoses carefully - they tell you WHAT went wrong and what to fix.
Proofs run on the HOST OS - write OS-correct commands (no bash on Windows).

**CWD:** `C:\Users\siriu\mcp-servers\dod-guard`

**Anti-cheat:** Proofs stored canonically in MCP storage.
`dod_check` executes commands from the canonical copy, not this markdown file.

**Proof form for this change.** Every leaf runs one named test and requires the
run to report at least one pass. A census of the store on 2026-08-12 read the
proofs that passed. 57 percent of them only checked that a string exists in a
file. So no leaf here greps a file or echoes a literal. A name pattern that matches no test
leaves `# pass 0` in the output, which fails the predicate. So the proof cannot
pass by naming a test that was never written.
</claude_instructions>

**Goal:** Report which scenarios a real integrated test covers, and draft specs for code that shipped without any

**Date:** 2026-08-12
**Target:** `C:\Users\siriu\mcp-servers\dod-guard`
**DoD ID:** `<assigned at import>`

---

## Requirements

<requirements>
- dod-guard/scenario-coverage: binds a scenario to the tests that exercise it. It judges coverage by whether a test reaches the code through a user-facing entry point.
- dod-guard/retroactive-spec-backfill: drafts requirements and scenarios for shipped behavior no spec describes, each draft unconfirmed until a human reads it.
</requirements>

---

## Definition of Done

<definition_of_done>

### cover command exists [ ]

  - [ ] Proof: `node --test --test-name-pattern="Command reports every scenario in the change" packages/dod-guard/dist/cli.cover.test.js` -> running cover on a change with spec deltas names every scenario, each with exactly one coverage state <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="Unknown change id is a usage error" packages/dod-guard/dist/cli.cover.test.js` -> cover on an id that names no change exits 3 and names the id it could not find <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### A scenario binds to named tests [ ]

  - [ ] Proof: `node --test --test-name-pattern="Declared test binds to the scenario" packages/dod-guard/dist/cover-binding.test.js` -> a scenario naming a test that exists reports as bound to that test <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A scenario with no declared test is unbound" packages/dod-guard/dist/cover-binding.test.js` -> a scenario naming no test reports as unbound, and the report guesses at no test <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A declared test that does not exist is an error" packages/dod-guard/dist/cover-binding.test.js` -> a scenario naming a missing test reports as a broken binding, naming both <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### Coverage requires a passing run [ ]

  - [ ] Proof: `node --test --test-name-pattern="Passing test covers its scenario" packages/dod-guard/dist/cover-results.test.js` -> a scenario whose every bound test passed reports as covered <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="Failing test does not cover its scenario" packages/dod-guard/dist/cover-results.test.js` -> a scenario with a failing bound test reports as not covered and names that test <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="Skipped test does not cover its scenario" packages/dod-guard/dist/cover-results.test.js` -> a scenario whose only bound test was skipped reports as not covered <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### Coverage requires reachability from an entry point [ ]

  - [ ] Proof: `node --test --test-name-pattern="Test through an entry point counts as integrated" packages/dod-guard/dist/cover-reach.test.js` -> a passing test that calls a declared entry point which reaches the implementation reports as covered and integrated <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="Test that bypasses every entry point is reported" packages/dod-guard/dist/cover-reach.test.js` -> a passing test reaching the implementation through no declared entry point reports as covered but not integrated <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="Implementation no entry point reaches is reported" packages/dod-guard/dist/cover-reach.test.js` -> an implementation no declared entry point reaches reports as unwired, distinct from covered but not integrated <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### A project declares its own entry points [ ]

  - [ ] Proof: `node --test --test-name-pattern="Declared entry points drive the reachability walk" packages/dod-guard/dist/cover-entry-points.test.js` -> the walk starts from the declared entry points and from no others <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A project with no declared entry points reports the gap" packages/dod-guard/dist/cover-entry-points.test.js` -> a project declaring none still reports covered or not covered, and states it checked no integration <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### cover reports and does not block [ ]

  - [ ] Proof: `node --test --test-name-pattern="Uncovered scenarios still exit 0" packages/dod-guard/dist/cli.cover.test.js` -> a run that finds uncovered scenarios reports them and exits 0 <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A broken run exits non-zero" packages/dod-guard/dist/cli.cover.test.js` -> a run that cannot read the change or the results exits 3 and names what it could not read <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### backfill command exists [ ]

  - [ ] Proof: `node --test --test-name-pattern="Command drafts requirements for a path" packages/dod-guard/dist/backfill.test.js` -> backfill on code with no spec writes a draft spec and names the source file and test behind each requirement <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A path that does not exist is a usage error" packages/dod-guard/dist/backfill.test.js` -> backfill on a missing path exits 3 and names the path <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### Backfill skips behavior an existing spec covers [ ]

  - [ ] Proof: `node --test --test-name-pattern="Covered behavior produces no draft" packages/dod-guard/dist/backfill.test.js` -> behavior an existing requirement describes produces no draft, and the run reports which requirement covered it <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="Partly covered behavior drafts only the gap" packages/dod-guard/dist/backfill.test.js` -> behavior an existing requirement covers in part drafts a scenario for the uncovered part only <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### Every drafted requirement carries a confirmation state [ ]

  - [ ] Proof: `node --test --test-name-pattern="A fresh draft is unconfirmed" packages/dod-guard/dist/confirm-state.test.js` -> a newly written drafted requirement carries an unconfirmed state <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="An unconfirmed requirement does not satisfy coverage" packages/dod-guard/dist/confirm-state.test.js` -> cover reports a scenario under an unconfirmed requirement as unconfirmed rather than covered <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A confirmed requirement behaves like any other" packages/dod-guard/dist/confirm-state.test.js` -> a confirmed requirement loses its drafted mark and every later command treats it as hand-written <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### Backfill records the evidence for each draft [ ]

  - [ ] Proof: `node --test --test-name-pattern="A draft from a test names that test" packages/dod-guard/dist/backfill-evidence.test.js` -> a requirement drafted from an existing test names that test file and the case within it <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A draft from code alone says no test backed it" packages/dod-guard/dist/backfill-evidence.test.js` -> a requirement drafted from code no test exercises states that no test backed it <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

### Backfill never edits a confirmed requirement [ ]

  - [ ] Proof: `node --test --test-name-pattern="Code that contradicts a confirmed requirement is reported" packages/dod-guard/dist/backfill.test.js` -> code contradicting a confirmed requirement leaves it untouched and reports the contradiction <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->
  - [ ] Proof: `node --test --test-name-pattern="A second run does not duplicate its own earlier drafts" packages/dod-guard/dist/backfill.test.js` -> a second run on unchanged code adds no new drafted requirement <!--p:{"type":"output_matches","value":"# pass [1-9]"}-->

</definition_of_done>
