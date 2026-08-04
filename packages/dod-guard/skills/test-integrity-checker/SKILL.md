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

A model that read the code before it wrote the tests asserts whatever the code
produced. Where the code returns 42 and the specification says 24, the test
asserts 42. It passes forever and catches nothing. A test whose expected value
would have to change once somebody fixes the bug is a second copy of that bug.

You detect none of this yourself. A shipped agent does the reading. Your work
is everything around that dispatch. Pick the target. Hand the agent evidence it
cannot see. Judge the reply. Repair the tests. Prove one repair catches a real
bug. Lock the result.

Say at the start that you are auditing test integrity, and that you are
checking whether the tests catch bugs or bless them.

Four kinds of work do not need this skill. Tests written before the
implementation are safe, because their author never watched the code run. Tests
written by a party other than the implementer are safe for the same reason.
Code with no logic to get wrong has nothing to bless. A snapshot file is its
own category. Every snapshot value is copied from output by design, so an audit
returns nothing but false criticals on one.

Stop here when the project already has a verified specification. Stop too when
somebody wrote the requirements down. Auditing tests against the code they came
from answers a weaker question than auditing them against the requirement. Send
that work to `/dod-guard:adversarial-workflow` and tell it to start at phase 2,
its test audit.

Use `rg` for every scan rather than `grep` or `findstr`. It behaves the same on
Windows and on POSIX. One caution: `rg --files` prints the native path
separator, so match a single path segment.

## Choosing what to audit

When the user names files, audit those.

Otherwise prefer recorded evidence over a guess. A surviving mutant is proof of
this exact problem. Somebody changed a line of production code and the whole
suite still passed. In this repository, `node scripts/mutation-queue.mjs`
writes `.data/micro-mutations/queue.json`, a ranked list of the weakest test
files. That script lives at the root of this repository only. It does not ship
inside the plugin or the npm package. A reader working in another repository
has no such command unless that repository runs its own mutation testing.

The file is shaped `{ "generated": ..., "queue": [ ... ] }`. One entry looks
like this.

```json
{
  "source": "packages/dod-guard/src/checker.ts",
  "test": "packages/dod-guard/src/checker.test.ts",
  "date": "2026-07-30T09:12:00.000Z",
  "summary": { "total": 41, "killed": 18, "survived": 11, "timeout": 0, "unviable": 12 },
  "score": 7,
  "stale": false,
  "unmapped": 0,
  "hotspots": [{ "line": 214, "count": 3, "mutators": ["EqualityOperator", "ConditionalExpression"] }]
}
```

Three fields change what you do.

- `score` ranks the entries. Work the highest first.
- `stale: true` means the survivor record predates the current build. Its line
  numbers cannot be trusted. Re-run `scripts/micro-mutations.mjs` before you
  use that entry's `hotspots`.
- `test: null` means no test file exists at all. That unit needs tests written,
  not audited. Report it and move to the next entry.

With no mutation data, pair the files by hand. Name the capitalized variants
too, because a case-sensitive filesystem hides them otherwise.

```
rg --files -g "*test*" -g "*spec*" -g "*Test*" -g "*Spec*" | sort
```

Sorting keeps a repeated run picking the same unit. Match each test file to its
production file through its imports or the project's naming convention. Each
pair is one audit unit.

## Sending the audit

Dispatch one audit unit per call, one production file paired with one test
file. Use this exact agent name.

```
subagent_type: "dod-guard:test-integrity-auditor"
prompt: production file <path>
        test file <path>
        These lines were changed and the whole suite still passed. Start there.
        For each one, name the test that was meant to catch the change, and say
        why it did not.
        line 214, 3 survivors, EqualityOperator and ConditionalExpression
```

That agent already carries its persona and its detection guidance for every
pattern. It also sets the severity for each one, how many findings it owes, and
the format of its reply. Never restate any of that. Carry the two file paths
and, when a queue entry exists, that entry's hotspot lines. Render each hotspot
as a line number, a survivor count, and the mutator names. The agent knows
nothing about mutation testing. Those lines, and the ask attached to them, are
the one thing it cannot reach on its own.

`subagent_type` names an agent, never a model. The model is a separate `model`
parameter on the same call. An auditor sharing a model with whoever wrote the
tests shares its blind spots, so the two must differ. The table that maps an
author model to a reviewer model lives in `adversarial-workflow/SKILL.md`
beside this file. Read the route there. When two distinct models are not
reachable, say so in the report and do not claim the audit was independent.
Then check the auditor before you trust it. Take one finding and work out its
correct expected value by hand. An auditor reviewing its own work fails that
check, and the whole reply is then suspect.

## Reading what comes back

The agent replies with findings, or with one line starting `NO_FINDINGS:` and a
reason. A reply carrying neither is not a result. Dispatch that unit again.

Each finding carries its own `SEVERITY`, one of `critical`, `major`, `minor`,
or `info`. Each finding also carries its own `PATTERN`, one of
`logic-mirroring`, `output-blessing`, `weak-assertions`, `mock-everything`,
`symmetry-inverse`, `happy-path-only`, or `copy-paste-parameterization`. Those
names belong to the agent. Pass them into your report unchanged.

The reply closes with a verdict line.

| Verdict | Meaning | What the run owes next |
|---|---|---|
| `INTEGRITY_FAIL` | at least one critical finding | These tests cannot catch bugs as they stand. Repair every critical finding before the unit is done. |
| `INTEGRITY_WEAK` | no critical finding, at least one major | Repair the major findings, or report each one you leave alone. |
| `INTEGRITY_PASS` | neither of the above | Record the result and take the next unit. |

Rank the findings before you edit anything. A finding sitting on a hotspot line
outranks one that does not. A weak assertion the agent merely suspects is
arguable. A line where a real change was made and every test still passed is
settled, because it is a counter-example rather than a suspicion.

## Repairing a test

Every repaired test must assert a value obtained from somewhere other than the
implementation under test. Four sources qualify. Compute the value by hand from
the specification. Compute it a second way that shares no structure with the
implementation. Take a standard test vector for the domain. Read it from a
separate reference implementation.

When you cannot establish the correct value, report the finding unfixed and
leave the assertion alone. A test rewritten around a second guess is worse than
the one it replaced. Add a TODO comment above it naming the finding, so the
next reader sees the problem after your report is gone.

Two repairs need a prescription the agent does not give. For a test that mocks
every dependency, assert on the data passed to the mocks. Another option is one
test that runs against real or realistic dependencies. For a test that only
checks a value surviving a round trip, add an assertion in one direction
against a known value.

Keep the tests that were already asserting correct values. Not every test in a
suspect file is wrong, and rewriting a correct test gains nothing.

Work one test file through to the end before you start another.

## Proving the repair

At least one repaired test per unit has to be shown failing against a real
defect. Confirm the working tree is clean first, because this is the one step
that edits production code on purpose. Break the production code. Run the test
and confirm it fails. Revert the code. Run the test again and confirm it
passes.

When the finding came from a hotspot, do not invent a defect. The queue entry
already names the mutators that survived at that line. Apply that recorded
change instead. The proof then covers the exact bug the suite let through
rather than a plausible one.

Afterwards the whole suite must pass. Measured coverage must not fall. A drop
means a repair took a code path out of testing. Read the test and coverage
commands out of the project rather than assuming a package manager.

## Locking a corrected test

dod-guard can hold a corrected test against later weakening by fingerprinting
it. Do this for every test whose correct value you established by hand, whose
defect proof passed, and which covers logic worth protecting. Skip it for the
rest. Locking a trivial test produces noise and protects nothing.

Call `dod_create` and give it a concrete leaf like the one below. The `holdout`
predicate compares the command's trimmed output against the stored digest,
ignoring case. It reports a weakened or removed test by name when the two
differ. The surrounding arguments belong to `/dod-guard:interview`.

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

Both `title` and `refinement` are load-bearing. `title` is required, so the
call is rejected without it. `refinement` defaults to `draft` on a leaf, and a
draft carries no command, so the fingerprint would never be checked and the DoD
would report incomplete forever.

Reproduce that command exactly, including its escaping. It is verified to run
under the Windows shell dod-guard uses.

## Reporting

Name every unit you audited. Give each repaired test with its pattern and its
severity as the agent wrote them. List every finding you left unfixed and say
why. State the outcome of the defect proof and the result of the full suite.
Give coverage before and after. Name every unit where model diversity was out
of reach.
