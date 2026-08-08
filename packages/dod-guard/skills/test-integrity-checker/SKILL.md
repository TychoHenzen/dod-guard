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

Run inside this repository, `node scripts/mutation-queue.mjs` writes `.data/micro-mutations/queue.json`
and ranks the least protective test files first. That script lives at the root of this repository
alone, and ships in neither the plugin nor the npm package. A reader in another repository has no
such list unless that project runs mutation testing itself.

The file pairs `generated` with `queue`. Each `queue` entry names `source`, `test`, `date`, `summary`,
`score`, `stale`, `unmapped` and `hotspots`. A `summary` names `total`, `killed`, `survived`,
`timeout` and `unviable`, and each hotspot names `line`, `count` and `mutators`.
Take the entries in order of `score`, highest first. A `stale` of true puts the survivor record before
the current build and its line numbers past trusting, so rerun `scripts/micro-mutations.mjs` before
touching those `hotspots`. A `test` of null means no test file exists, which calls for writing tests
rather than auditing them, so log that entry and move down.

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

A corrected test earns a digest once you worked its value out by hand, its fault demonstration
passed, and the logic beneath it deserves defending. Every other test stays without one.

`dod_create` takes a leaf whose refinement is concrete. Its `holdout` predicate runs the command,
trims the output, matches that against the stored digest while ignoring case, and names the test once
the two diverge. `/dod-guard:interview` covers the arguments around the leaf. This leaf runs under
the Windows shell dod-guard uses, so copy the command character for character, escaping included,
rather than re-quoting or reformatting it:

```json
{
  "title": "rate limiter tests keep their hand-computed expectations",
  "refinement": "concrete",
  "command": "node -e \"const crypto = require('crypto'); const fs = require('fs'); const content = fs.readFileSync('<test file path>', 'utf8'); const hash = crypto.createHash('sha256').update(content).digest('hex'); console.log(hash);\"",
  "predicate": { "type": "holdout", "value": "<the digest>" },
  "description": "Fails once somebody weakens or deletes a corrected assertion",
  "category": "test_audit"
}
```

`title` is mandatory, so dod-guard turns away a call without one. An unset `refinement` defaults to
`draft`, a draft holds no command, and a digest check with no command to run leaves the DoD
incomplete.

The report names every unit audited. Each repaired test appears with the pattern and the severity the
agent gave it. Each finding left unrepaired appears with your reason. The fault demonstration's
outcome and the full suite's result both appear. Coverage appears before and after. Every unit that
ran on a single model appears marked as such.
