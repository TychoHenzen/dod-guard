---
name: quality-refactor
description: >-
  Systematically refactor code to a high quality bar using an explicit,
  machine-checked rule set - one type per file, files under 300 lines,
  cyclomatic complexity under 10, at most 7 parameters, no unnamed tuples,
  guard clauses instead of else, free functions instead of stateless methods,
  and aggressive deletion of dead, test-only, duplicate, and compatibility-shim
  code. Ships a zero-dependency scanner and emits a `.step-session/steps.json`
  plan for /dod-guard:step-by-step to execute one file at a time.
  TRIGGER when: user says "refactor this properly", "clean this up to a high
  standard", "enforce code quality", "quality pass", "reduce complexity",
  "split these files", "this file is too long", "remove dead code", or asks for
  a SOLID / Fowler-catalog refactoring pass on a module or repo.
argument-hint: "[target: repo, folder path, module name, or file list]"
---

# Quality Refactor

Refactor to a fixed, machine-checked quality bar. Produce a plan; hand the plan
to `/dod-guard:step-by-step`; ratchet the numbers down and never let them go
back up.

## Why This Exists

LLMs write code that passes tests and violates every structural norm a senior
engineer would enforce. The failures are consistent and they are all invisible
to a test suite:

| What LLMs do | What it should be |
|---|---|
| Five types in one file because "they're related" | One type per file |
| 600-line modules that grew by append | Under 300 lines, ideally under 100 |
| One function that does parse + validate + transform | One concern per function |
| `if/else` pyramids five deep | Guard clauses, early return |
| Eight positional parameters | Four or fewer, or a named parameter object |
| `[string, number]` returned from a public function | A named type |
| Helper methods on a class that never touch `this` | Free functions |
| Dead code left behind "just in case" | Deleted - git remembers |
| A `v2` next to the `v1` it replaced | One implementation |
| Exported symbols only the tests call | Deleted, along with those tests |

Prose instructions do not fix this; the model agrees, then does it again. This
skill enforces the bar with a scanner that exits non-zero, and structures the
work so the model is never asked to hold the whole codebase in its head.

## The Two Tiers

Every rule has a **hard** bound and a **preferred** bound. This is the
difference between "never ship this" and "make it better every pass."

| Rule | Preferred (warn) | Hard (error) |
|---|---|---|
| `line-length` | ≤ 80 | ≤ 120 |
| `file-length` | ≤ 100 | ≤ 300 |
| `function-length` | ≤ 30 | ≤ 60 |
| `complexity` (cyclomatic) | ≤ 5 | ≤ 10 |
| `param-count` | ≤ 3 | ≤ 7 |
| `nesting-depth` | ≤ 3 | ≤ 5 |
| `types-per-file` | - | 1 |
| `duplicate-block` (6 lines) | 2 sites | 2 sites |
| `unnamed-tuple` | - | none allowed |
| `dead-export` | - | none allowed |
| `unused-local` | - | none allowed |
| `test-only-export` | none preferred | - |
| `commented-out-code` | - | none allowed |
| `else-branch` | none preferred | - |
| `stateless-method` | none preferred | - |
| `todo-marker` | none preferred | - |

**Hard bounds are a gate.** A refactor is not done while any error remains in
its scope.

**Preferred bounds are a ratchet.** They may exceed the bound today, but the
count must never go up. `--profile=strict` promotes every preferred bound to a
hard bound; use it on new code and on modules already cleaned.

Full rationale and fix recipes per rule: `reference/rules.md`.
Smell → refactoring mapping (Fowler catalog, SOLID): `reference/catalog.md`.

## The Scanner

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs" --help
```

Zero dependencies, Node 18+. One scanner parses seven language families:
TypeScript/JavaScript, C#, Rust, Python, Go, Java/Kotlin, and C/C++. Not
every rule applies to every one of them (`reference/rules.md` says which),
and function detection itself is not one algorithm for all seven. Rust and
Go anchor on the `fn`/`func` keyword, because both write `if`/`for`/`while`
with no parentheses, so a bare call before a brace (`if path.exists() {`)
would otherwise read as a definition. Python reads indentation. The rest,
TypeScript/JavaScript, C#, Java/Kotlin, and C/C++, share one
call-vs-definition heuristic. If `${CLAUDE_PLUGIN_ROOT}` is not set, find it:

```bash
find ~/.claude/plugins -name quality-scan.mjs -path '*quality-refactor*' 2>/dev/null | head -1
```

Set `QS` to that path once and reuse it. Key invocations:

```bash
node "$QS" src --top=20                                  # triage: what is worst
node "$QS" src --format=units                            # per-file work units, worst first
node "$QS" src --write-baseline=.quality/baseline.json   # record the ratchet
node "$QS" src --baseline=.quality/baseline.json --fail-on=regression
node "$QS" src --fail-on=error                           # the hard gate
node "$QS" src --profile=strict --fail-on=error          # the bar for new code
node "$QS" Scripts --test-path=Scenario/ --root=.        # declare a harness dir
```

Exit codes: `0` gate passed · `1` gate failed · `3` usage error.

**Declare test-support directories.** `--test-path=<fragment>` marks every path
containing that fragment as test code, and it repeats. Use it for harness,
fixture, and scenario directories the built-in patterns miss. Without it the
scanner reads a harness as production code that only tests call, and reports the
whole harness under `test-only-export`.

**Point `--root` at the repo, not at the target.** Reachability reads non-code
manifest files as evidence that a symbol is used. That covers scene files,
project files and component templates. A Godot scene that wires
`PlayerController.cs` usually sits above `Scripts/`. A root scoped to the
target misses that scene, and the class looks dead. Manifests are collected
from `--root` only.

Generic data formats do not count. A `.json`, `.yaml`, `.xml` or `.md` file
that merely names a symbol is not usage.

A baseline records which files it scanned, not just their violation counts. A
file the baseline has never seen is **adopted** on the next `--baseline` run.
Its current counts go into the baseline file. It is not reported as a
regression. Without that, every file you extract during a refactor would fail
the ratchet against a phantom zero. From the run after adoption on, the file is
held to the counts that were recorded. Baselines written by an older scanner
(no file list) are rejected with exit `3` - re-record with `--write-baseline`.

**The scanner is a heuristic, not a compiler.** It is tuned to stay quiet
rather than to catch everything. Two consequences: a finding is almost always
real, and a clean scan does not mean a clean module. The judgment rules below
are not scanned at all - you have to look.

## What the Scanner Cannot See

Do these by reading. They are the highest-value part of the pass.

### 1. File hierarchy

A directory should answer "what is this?" in one word, and a file should be
findable without grep. Signs it is wrong:

- A `utils/`, `helpers/`, `common/`, or `misc/` directory. These are named
  after the author's uncertainty. Every file in one belongs somewhere specific.
- A directory with 20+ flat files and no subdirectories.
- A directory with one file.
- Files whose name does not match their single exported type.
- Two directories that would need the same name to describe them honestly.

**Fix:** name directories after domain concepts, not layers or roles. Move the
file next to its only consumer if it has one. One type per file means the file
name and the type name are the same word.

### 2. Compatibility shims

Old signatures that forward to new ones, adapter classes, `v1`/`v2` pairs,
re-export files mapping old names to new. **Default to deletion.** Check `git
log` - if the same development cycle introduced both the old and the new, no
external consumer ever existed. Do not build a proof; migrate the call sites
and delete.

### 3. Useless tests

Delete a test when any of these is true. Deleting a bad test is an improvement,
not a coverage loss - it was never covering anything.

- It asserts on a mock it configured in the same test.
- It asserts nothing, or only that the code did not throw.
- Its assertions are so loose they would pass if the function returned a
  constant.
- It tests a symbol nothing in production calls (`test-only-export`). Check
  first that the symbol is not test-support code. If it is, declare its
  directory with `--test-path` instead of deleting anything.
- It duplicates another test with different literals and no different branch.
- It was written to make a coverage number move.

The test that survives is the one that **fails when the requirement is
violated**. If you cannot state what behavior change would break a test,
delete it.

### 4. Data types that carry behavior

A type that holds data should hold data. Operations on it belong in free
functions (Meyers' "prefer non-member non-friend functions"; extension methods
in C#; trait impls kept separate in Rust). This maximizes encapsulation - a
free function can only use the public surface - and it keeps the type readable.
The `stateless-method` rule catches the mechanical case; the judgment case is a
class whose methods touch one field each and could all be free functions over a
plain record.

### 5. SOLID violations

- **SRP** - the file-length and complexity numbers are proxies. The real test:
  can you name the file's job without "and"?
- **OCP** - a `switch` on a type code that grows with every feature wants
  polymorphism (*Replace Conditional with Polymorphism*).
- **LSP** - a subclass that throws on an inherited method (*Refused Bequest*)
  wants delegation instead.
- **ISP** - an interface where most implementors stub half the methods.
- **DIP** - a policy module importing a concrete driver.

## Process

### Phase 0: Baseline

1. Git clean, or ask the user: stash, include, or abort.
2. Run the project's build and full test suite. **Record the result.** If it is
   already failing, stop and report - you cannot prove behavior preservation
   against a red baseline.
3. Resolve the exact test command. Write it down; every step will use it.
4. `mkdir -p .quality && node "$QS" <scope> --write-baseline=.quality/baseline.json`

### Phase 1: Triage

```bash
node "$QS" <scope> --top=30
node "$QS" <scope> --format=units > .quality/units.json
```

Read the summary. Read `units.json` - each entry is one file with every rule it
violates. Then do the reading pass from "What the Scanner Cannot See" and write
your findings into `.quality/judgment.md`, one heading per category.

### Phase 2: Order the work

**Order matters more than any individual fix.** Do it in waves, and never
reorder them:

| Wave | Rules | Why this order |
|---|---|---|
| 1. DELETE | `dead-export`, `unused-local`, `test-only-export`, `commented-out-code`, shims, useless tests | Deleting a file deletes all of its other violations for free. Any work done on code that is about to be deleted is wasted work. |
| 2. DEDUPE | `duplicate-block` | Extracting a shared function once beats fixing the same complexity finding in three copies. |
| 3. SPLIT | `types-per-file`, `file-length`, hierarchy moves | Splitting relocates violations. Do it before measuring anything per-file. |
| 4. SIMPLIFY | `complexity`, `function-length`, `nesting-depth`, `else-branch` | Structure is settled; now fix control flow. |
| 5. SIGNATURES | `param-count`, `unnamed-tuple`, `stateless-method` | Signature changes touch call sites, so do them once the callers are stable. |
| 6. COSMETIC | `line-length`, `todo-marker` | Last, because every wave above rewrites lines. |

Doing wave 6 first is the single most common way to waste an entire refactoring
pass.

### Phase 3: Emit the plan

Write `.step-session/steps.json` - the schema `/dod-guard:step-by-step` reads.
**One step per file per wave.** A step that touches two files is two steps,
except for a deletion that requires updating its call sites, which is one.

```json
{
  "goal": "Quality refactor: <scope> to hard bounds, ratchet preferred bounds",
  "cwd": "/absolute/path",
  "plan_source": "/absolute/path/.quality/units.json",
  "steps": [
    {
      "id": "W1-01",
      "title": "Delete dead exports in src/tree-utils.ts",
      "description": "Remove findInChildren (never referenced) and its tests. Update any imports. Do not change behavior of remaining exports.",
      "files": ["src/tree-utils.ts", "src/tree-utils.test.ts"],
      "deps": [],
      "verify_surface": "structural",
      "verify_cmd": "npm test && node \"$QS\" src --baseline=.quality/baseline.json --fail-on=regression",
      "manual_required": false,
      "status": "pending"
    }
  ]
}
```

Rules for step construction:

- `verify_surface` is `structural` for every step in this skill. A refactor is
  verified by "tests still pass AND no new violations", never by "it compiles."
- `verify_cmd` is always the project test command **and** the ratchet check,
  joined with `&&`. Resolve `$QS` to the real absolute path in the JSON - a
  step briefing is read by a subagent with no shell history.
- `description` states the refactoring by name from the catalog (*Extract
  Function*, *Replace Nested Conditional with Guard Clauses*, *Introduce
  Parameter Object*) plus the concrete target. Vague descriptions produce
  vague diffs.
- Deletion steps say what to delete and what to migrate, explicitly.
- Cap each step at one file plus its test file plus call sites.

### Phase 4: Lock-in gate

Report to the user before any step runs:

- File count in scope, total violations, error count
- Step count per wave
- The resolved `verify_cmd`
- Anything from `judgment.md` that changes public API or file layout

Wait for confirmation. This is the only planned interruption.

### Phase 5: Execute

Hand off to `/dod-guard:step-by-step`. It owns dispatch, verification, the
fixer budget, and the approach-pivot rule. Do not re-implement any of that
here, and do not execute steps inline - this skill's job ends at a correct
plan.

### Phase 6: Ratchet

After all steps complete:

1. Full build + test, compared against the Phase 0 baseline.
2. `node "$QS" <scope> --fail-on=error` - must exit 0.
3. Rewrite the baseline: `node "$QS" <scope> --write-baseline=.quality/baseline.json`
4. Report: before/after counts per rule, files deleted, types split out.
5. Present a commit message. Do **not** auto-commit.

Suggest to the user that `--baseline` + `--fail-on=regression` belongs in CI.
A ratchet that nobody runs is not a ratchet.

## Rules

1. **Behavior is preserved, always.** If a change alters what the program does,
   it is not a refactoring - it is a separate task. Split it out and say so.
2. **Delete before you polish.** Wave order is not a suggestion.
3. **The test suite is the proof.** Every step re-runs it. "It should be fine"
   is not a verification.
4. **Never weaken a test to make a refactor pass.** If a refactor breaks a
   test, the refactor is wrong until proven otherwise. Changing the assertion
   to match the new output is how a refactor silently becomes a regression.
5. **No compatibility shims.** Migrate the call sites in the same step.
6. **A deleted file needs no further steps.** Re-scan after each wave rather
   than trusting the original unit list.
7. **The scanner is the floor, not the ceiling.** A file can pass every rule
   and still be badly designed. The judgment pass is where the real value is.
8. **Do not add abstraction to satisfy a metric.** Splitting a 310-line file
   into two files that must always change together makes the number better and
   the code worse. Say so and leave it, with a note.

## Anti-Patterns

| Temptation | Correct response |
|---|---|
| "Let me fix all the line lengths first, they're easy" | NO. Wave 6. Everything above rewrites those lines. |
| "This 400-line file just needs its functions shortened" | Check whether half of it is dead first. Wave 1. |
| "I'll extract a helper to get complexity under 10" | Only if the helper is a real concept. A `doPart2()` that is called once is complexity laundering. |
| "The test fails after my refactor, I'll update the assertion" | NO. The refactor changed behavior. Revert and rethink. |
| "I'll keep the old export in case something uses it" | NO. Grep, migrate, delete. Git has it. |
| "These two files are 90% identical but I'll leave it, they might diverge" | Wave 2. "Might diverge" is speculation; duplication is real. |
| "Six parameters is fine, they're all needed" | Introduce Parameter Object. The parameters being needed is not the question. |
| "I'll do the whole module in one step, it's all related" | NO. One file per step. That is what makes it verifiable. |
| "The scanner says 0 errors, we're done" | The scanner does not read hierarchy, shims, or test quality. Do the judgment pass. |
| "I'll split this file to get under 300 lines" | Only along a real seam. An arbitrary split is worse than a long file - note it and move on. |

## Scope Detection

| Input | Scope |
|---|---|
| (empty) | Whole repo, source directories only |
| `src/services/` | That directory tree |
| `authentication` | Files matching the concept - confirm the list with the user |
| a file list | Exactly those files plus their tests |

For a repo-scale scope with 50+ files, do not plan the whole thing at once.
Take the worst 10 files by error count, plan those, execute, re-scan, repeat.
The ratchet baseline is what makes this safe to do incrementally.
