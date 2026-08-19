---
name: test-integrity-checker
description: >-
  Audit a test file for tests written to match the implementation instead of a
  specification, then repair them. Use when the user says the tests may have
  been written to fit the code rather than a spec. Use it when the user asks
  you to check my tests, audit tests, review tests for bugs, or verify test
  correctness. Use it when the user asks whether these tests are real, says the
  tests might be wrong, or says a model wrote them. Use it when the user does
  not trust tests that pass, or calls for the test cop or the test bullshit
  detector. Use it when tests assert only toBeDefined or toBeTruthy, when every
  dependency is mocked, when a round trip is the only check, or when no test
  covers a negative case. The skill both finds these tests and repairs them.
argument-hint: [test file or directory to audit]
---
# Test integrity checker

Tests written after the code tend to record what the code produced, not what the specification
requires. You end with one test file whose expectations come from outside the implementation, one
demonstrated fault, and a digest guarding the result.

## Agent dispatch compatibility

Resolve `<agent-definitions-dir>` before dispatching a dod-guard agent. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/agents`. In Codex, use the `agents` directory beside the parent `skills`
directory that contains this loaded `SKILL.md`.

For every `dod-guard:<name>` dispatch:

- Claude uses `dod-guard:<name>`.
- Codex uses `dod_guard_<name>`, with hyphens converted to underscores, when that custom agent is
  registered.
- If the Codex custom agent is unavailable, read `<agent-definitions-dir>/<name>.md` completely.
  Spawn `explorer` when its `tools` omit `Write` and `Edit`. Spawn `worker` otherwise.
  Include the definition body and task briefing in the spawn message.
- Preserve every clean-context, model-separation, dispatch-cap, and return-shape rule below.

## What qualifies, and which file to take

Four situations put a file out of scope. Tests older than the implementation carry no fitted
expectations. Tests by an author other than the implementation's already come from a second source.
Code with no logic in it offers nothing to get wrong. Snapshot files copy output by design, so an
auditor marks every value critical and each of those criticals is wrong.

Where the project keeps written requirements or a verified specification, measure the tests against
those requirements rather than against the implementation they came from. Run
`/dod-guard:adversarial-workflow` from its phase 2 in place of this skill.

Scan with `rg` rather than `grep` or `findstr`, since `rg` returns the same results under Windows and
POSIX. Because `rg --files` writes the platform's own separator, keep every glob to a single path
segment.

Files the user names are the files audited. Otherwise choose on recorded evidence rather than
instinct. A mutant that survived is a logged case of this exact defect: one line of production code
changed and the whole suite stayed green.

If the project has a mutation-testing queue (e.g. a script that writes a
ranked list of least-protective test files), use it. Each queue entry
names a source file, its test file, a survival score, and hotspot line
numbers. Take entries in order of score, highest first. A stale entry has
line numbers that predate the current build, so rerun the mutation tool
before touching those hotspots. An entry with no test file calls for
writing tests rather than auditing them, so log it and move down.

Without mutation data, pair the files by hand:

```
rg --files -g "*test*" -g "*spec*" -g "*Test*" -g "*Spec*" | sort
```

Each test ties back to its production file through an import or the project's naming rule, and one
tie makes one unit.

## The dispatch

The `dod-guard:test-integrity-auditor` agent produces the findings. One call handles one unit, being
a single production file with the single test file that covers it.

```
subagent_type: "dod-guard:test-integrity-auditor"
model: <a model other than the one that wrote these tests>
prompt:
  Production file: src/rate-limiter.ts
  Test file: test/rate-limiter.test.ts
  Survivors: line 42, count 3, EqualityOperator and ConditionalExpression
  These lines were changed and the whole suite still passed. Start there.
  For each one, name the test that was meant to catch the change, and say
  why it did not.
```

Your prompt holds the two paths. Where a queue entry backs the unit, it also holds that entry's
hotspot lines with a request to work from them, since mutation testing lies outside what the agent
knows. Persona, per-pattern detection guidance, the severity behind each pattern, the count of
findings owed and the layout of the answer all sit in the agent file already. Send paths and
hotspot lines alone rather than any of that.

`subagent_type` selects an agent. The model comes from a separate `model` parameter on the same call,
and it has to differ from the model that wrote these tests. `adversarial-workflow/SKILL.md`, in the
directory beside this one, maps an author model to its reviewer, so take the route from there. Where
a single model is all you can reach, say so in writing rather than calling the audit independent.

Spend one dispatch on a unit. An unreadable answer earns that unit one more. Nothing beyond that.

## Verdict and repair

An answer counts when it holds findings, or when it holds one line opening `NO_FINDINGS:` with a
reason. An answer holding neither goes back as that unit's second call.

Findings arrive labelled. `SEVERITY` reads `critical`, `major`, `minor` or `info`. `PATTERN` reads
`logic-mirroring`, `output-blessing`, `weak-assertions`, `mock-everything`, `symmetry-inverse`,
`happy-path-only` or `copy-paste-parameterization`. Both vocabularies are the agent's, so pass every
label on as it arrived.

`INTEGRITY_FAIL` closes a reply holding at least one critical, and every critical is repaired before
the unit is done. `INTEGRITY_WEAK` closes a reply whose worst finding is a major, so repair the
majors or record why each one you leave stays. `INTEGRITY_PASS` closes a reply with neither, and that
unit is done.

A repaired assertion carries a value the implementation never produced. Four origins qualify:
computation you do by hand from the specification, a second computation sharing no machinery with the
implementation, a standard test vector for the domain, or output from a separate reference
implementation.

Where none of the four is open to you, keep the assertion as it stands. Carry the finding into the
report unrepaired, with a `TODO` above the line naming it so the problem survives your report.

Two patterns arrive without a cure attached. A test that stubs out every dependency gains assertions
on the data handed to those stubs, or one added test running against real or realistic dependencies.
A test that only watches a value survive a round trip gains one assertion in a single direction
against a value already known.

## Proof and gates

Each unit needs one repaired test seen failing on a genuine fault. Confirm the working tree holds
nothing uncommitted first, since this step alters production code on purpose. Break the code. Watch
the test fail. Restore the code. Watch the test pass.

A finding traced to a recorded surviving mutation takes that mutation as its fault rather than a new
one, so the demonstration covers the bug the suite let past.

Two gates then close the unit. The full suite passes. Measured coverage sits no lower than before,
since a drop says a repair pulled a path out of testing.

## Locking, then the report

A corrected test earns a binding once you worked its value out by hand, its fault demonstration
passed, and the logic beneath it deserves defending. Every other test stays without one.

Where the change carries an OpenSpec delta, add a `#### Scenario:` naming the behavior the
corrected assertion now protects, and bind the test to it with a `covers:` marker directly above
the test:

```
// covers: <group>/<capability> :: <requirement title> :: <scenario title>   (JS/TS/Go/Rust/C/Java)
# covers: <group>/<capability> :: <requirement title> :: <scenario title>    (Python/Ruby/Shell)
```

`dod-guard cover` then reports the scenario covered once the marker names a real test that exercises
it, and reports it uncovered again the moment somebody deletes the test or the marker. That is the
project's mechanism for catching a weakened or removed corrected assertion; see
`/dod-guard:interview` for how a scenario and its marker get written. Where the change has no
delta to bind against, note in the report which corrected tests still want that binding once one
exists.

The report names every unit audited. Each repaired test appears with the pattern and the severity the
agent gave it. Each finding left unrepaired appears with your reason. The fault demonstration's
outcome and the full suite's result both appear. Coverage appears before and after. Every unit that
ran on a single model appears marked as such.
