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

## What you deliver

You produce one artifact: a step plan at `.step-session/steps.json` that `/dod-guard:step-by-step` executes
one file at a time. You write the plan and stop. You run no step yourself, you change nothing about what the
program does, and you dispatch no subagent of your own. The user approves the plan before any of it runs.

The plan sorts its steps into six waves, named below. Write one step per file per wave. A step that would
touch two files becomes two steps. The single exception is a deletion that has to update its call sites,
which stays one step.

```json
{
  "goal": "Quality refactor: <scope> to hard bounds, ratchet preferred bounds",
  "cwd": "/absolute/path", "plan_source": "/absolute/path/.quality/units.json",
  "steps": [
    {
      "id": "W1-01", "title": "Delete dead exports in src/tree-utils.ts",
      "description": "Remove findInChildren (never referenced) and its tests.",
      "files": ["src/tree-utils.ts", "src/tree-utils.test.ts"], "deps": [],
      "verify_surface": "structural", "manual_required": false, "status": "pending",
      "verify_cmd": "npm test && node \"$QS\" src --baseline=.quality/baseline.json --fail-on=regression"
    }
  ]
}
```

Set `verify_surface` to `structural` on every step you emit, with no exception. Passing tests and no fresh
violations are what prove a refactor, rather than a compile that succeeded.

Build every `verify_cmd` by joining the project test command and the ratchet check with `&&`. Expand `QS`
into a real absolute path inside the file, because the worker who reads a step briefing has no shell history.

Name the refactoring in each `description`, taken from the catalog, such as Extract Function, Replace Nested
Conditional with Guard Clauses, or Introduce Parameter Object, and pair it with the concrete target. A
deletion step says what to delete and what to migrate.

Hold each step to one file plus that file's test file plus its call sites. Write `status` as `pending` on
every new step. The executor is what later writes `completed`, `skipped` or `blocked`.

## Wave order

| Wave | Rules | Why it sits here |
|------|-------|------------------|
| 1 DELETE | `dead-export`, `unused-local`, `test-only-export`, `commented-out-code`, shims, worthless tests | removing a file clears all of its other violations at once, and work spent on doomed code is wasted |
| 2 DEDUPE | `duplicate-block` | extracting one shared function beats repairing the same finding in three copies |
| 3 SPLIT | `types-per-file`, `file-length`, hierarchy moves | splitting moves violations between files, so it precedes any per-file measurement |
| 4 SIMPLIFY | `complexity`, `function-length`, `nesting-depth`, `else-branch` | structure has settled by now, so control flow can be fixed where it stands |
| 5 SIGNATURES | `param-count`, `unnamed-tuple`, `stateless-method` | a signature change reaches call sites, so it waits until the callers stop moving |
| 6 COSMETIC | `line-length`, `todo-marker`, `comment-bloat`, `comment-restates-code` | every wave above rewrites lines, so starting here wastes the whole pass, and a comment judged before its code moves is judged against the wrong subject |

Keep the waves in that sequence on every run.

## Scope

| Argument | What you plan against |
|----------|-----------------------|
| empty | every source directory in the repository |
| a directory path | that tree |
| a concept word | the matching file list, confirmed with the user first |
| a file list | exactly those files plus their tests |

At 50 files or more, plan only the worst 10 by error count, execute them, re-scan, and repeat until the scope
is clean. The ratchet baseline makes that safe, because each pass locks in what the pass before it fixed.

Deleting dead code, splitting files, simplifying control flow, reshaping signatures and recording the ratchet
baseline all sit inside this skill. Executing the plan, altering behavior and spawning subagents sit outside
it.

## Standing rules

Behavior is preserved. When a change alters what the program does, split it out as a separate task and name
it as one.

A test that fails after a refactor means the refactor is wrong until you prove otherwise. Fix the code rather
than editing the assertion to match the new output, because that turns a refactor into a quiet regression.

Re-scan after each wave and plan from the fresh result rather than from the original unit list, because a
file you deleted needs no further steps.

Refuse abstraction added only to move a number. Splitting a 310-line file into two halves that must always
change together improves the metric and worsens the code. Say so and leave the file alone with a note rather
than splitting it. Split along a real seam or not at all.

## What measurement misses

Five things decide the shape of the code and no scanner sees them. Walk each one and record what you find.

1. File and directory hierarchy. A directory should answer what it holds in one word, and a file should be
   findable without a search. A name such as `utils/` records the author's uncertainty rather than a subject,
   so name a directory after a domain concept rather than after a layer or a role. Move a file next to its
   only consumer when it has exactly one. One type per file means the file name and the type name are the
   same word.

2. Compatibility shims: an old signature forwarding to a new one, an adapter class, a v1 and v2 pair, a
   re-export file mapping old names to new. Default to deleting them. Read the git history, and when a single
   development cycle introduced both sides, no outside caller ever existed. Migrate the call sites and delete
   rather than assembling a proof that nobody depends on the shim.

3. Worthless tests. Delete a test when any of these holds: it asserts on a mock it configured itself, it
   asserts nothing or only that nothing threw, its assertions are loose enough to pass against a constant, it
   covers a symbol no production code calls, which the scanner reports as `test-only-export`. Delete it too
   when it repeats another test with different literals and no different branch, or when it exists only to
   move a coverage number. One exception: confirm first that the symbol is test-support code, and when it is, declare its directory with
   `--test-path` rather than deleting anything. The test worth keeping is the one that fails when the
   requirement is broken, so delete any test whose breaking behavior change you cannot state.

4. Data types carrying behavior. Operations on a type that holds data belong in free functions, which can
   reach the public surface alone. The `stateless-method` rule catches the mechanical case. The judgment case
   is a class whose methods each touch one field and could all become free functions over a plain record. The
   language mechanism differs: an extension method in C#, a trait impl kept separate in Rust, a plain free
   function elsewhere. Meyers argued the same point as prefer non-member non-friend functions.

5. SOLID violations. Record which principle the type breaks, and read `reference/catalog.md` for the
   refactoring that answers it.

## The bar

| Rule | Preferred (warn) | Hard (error) |
|------|------------------|--------------|
| `line-length` | 80 | 120 |
| `file-length` | 100 | 300 |
| `function-length` | 30 | 60 |
| `complexity` (cyclomatic) | 5 | 10 |
| `param-count` | 3 | 7 |
| `nesting-depth` | 3 | 5 |
| `types-per-file` | - | 1 |
| `duplicate-block` (6-line window) | 2 sites | 2 sites |
| `comment-bloat` (comment lines per line of code) | 2x | 4x |
| `unnamed-tuple` | none | none |
| `dead-export` | none | none |
| `unused-local` | none | none |
| `commented-out-code` | none | none |
| `test-only-export` | none | - |
| `else-branch` | none | - |
| `stateless-method` | none | - |
| `comment-restates-code` | none | - |
| `todo-marker` | none | - |

A hard bound is a gate. The refactor stays unfinished while any error remains in scope.

A preferred bound is a ratchet. A count may sit above it today, and it must never rise.

`--profile=strict` promotes every preferred bound to a hard bound. Reach for it on new code and on modules
you have already cleaned.

Read `reference/rules.md` for the reason behind each rule, the fix recipes, and which rules apply to which
language, rather than working from memory. Read `reference/catalog.md` for the mapping from smell to
refactoring, the Fowler catalog and SOLID. Point at both files instead of repeating them.

## Running the scanner

The scanner lives at `${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs`. It has zero
dependencies and needs Node 18 or later. It reads seven language families: TypeScript and JavaScript, C#,
Rust, Python, Go, Java and Kotlin, and C and C++. Some rules apply to a subset, and `reference/rules.md` says
which.

```bash
QS="${CLAUDE_PLUGIN_ROOT}/skills/quality-refactor/scripts/quality-scan.mjs"
# When CLAUDE_PLUGIN_ROOT is unset, resolve QS once:
QS=$(find ~/.claude/plugins -name quality-scan.mjs -path '*quality-refactor*' 2>/dev/null | head -1)

node "$QS" src --top=20
node "$QS" src --format=units > .quality/units.json
node "$QS" src --write-baseline=.quality/baseline.json
node "$QS" src --baseline=.quality/baseline.json --fail-on=regression
node "$QS" src --fail-on=error
node "$QS" src --profile=strict --fail-on=error
node "$QS" packages/app/src --test-path=harness --test-path=fixtures --root=.
```

Exit codes: 0 the gate passed, 1 the gate failed, 3 a usage error.

`--test-path=<fragment>` marks every path containing that fragment as test code, and you may repeat it. Pass
it for the harness, fixture and scenario directories the built-in patterns miss. Leave it off and the scanner
reads a harness as production code that only tests call, then reports the whole harness under
`test-only-export`.

`--root` points at the repository rather than at the scanned target. Reachability accepts a non-code manifest
that names a symbol as evidence the symbol is used, which covers scene files, project files and component
templates, and the scanner gathers manifests from `--root` alone. A root narrowed to the target misses a
manifest sitting above it, and the symbol then reads as dead. A generic data file that merely mentions the
name is not usage, and that covers `.json`, `.yaml`, `.xml` and `.md`.

A baseline records which files it scanned, not only their counts. On the next `--baseline` run the scanner
adopts a file it has never seen at that file's current counts rather than reporting a regression. A file
you extract mid-refactor is therefore measured against its own first reading rather than against a zero.
From the following run onward, that file is
held to its recorded counts. A baseline written by an older scanner carries no file list, so the scanner
rejects it with exit 3 and you re-record it with `--write-baseline`. `--baseline=<path>` reads the path you
hand it, so aim a local check at a copy rather than at the tracked baseline.

The scanner is a heuristic rather than a compiler, and it is tuned to report little. A finding is almost
always real, and a clean scan is permission to keep reading rather than proof the module is clean.

## The run, start to finish

**Phase 0.** Confirm the working tree is clean, and when it is dirty ask the user to stash, to include the
changes, or to abort. Run the project's build and full test suite and record the result. Stop and report when
either is already failing, because behavior preservation cannot be proved against a red baseline. Resolve the
exact test command once and write it down, because every step uses it. Run `mkdir -p .quality`, then record
the ratchet baseline with `--write-baseline=.quality/baseline.json`.

**Phase 1.** Run the scanner twice over the scope. The first run is a worst-first summary with `--top=20`.
The second writes per-file work units to `.quality/units.json` with `--format=units`, worst first, one entry
per file naming every rule that file breaks. Then read those same files yourself for the five things no scanner sees,
and write the findings to `.quality/judgment.md` under one heading per category.

**Phase 2.** Sort every unit into the six waves and hold that sequence. A file with violations in three waves
yields three steps, one in each.

**Phase 3.** Write `.step-session/steps.json` in the shape given at the top of this skill, one step per file
per wave, each with a resolved `verify_cmd` and a `description` that names its refactoring.

**Phase 4.** Report to the user before any step runs: the number of files in scope, the total violation count
with the error count called out, and anything in `judgment.md` that changes a public API or the file layout.
Wait for the user to confirm. Leave the per-wave step counts and the verify command out of this report.
`/dod-guard:step-by-step` shows both as soon as it takes over, and asks for approval of its own plan.

**Phase 5.** Hand the plan to `/dod-guard:step-by-step`. That skill owns dispatch, verification, the repair
budget and the approach-pivot rule. Point at it rather than restating any of that, and let it run each step
rather than executing one here. Your work ends at a correct plan.

**Phase 6.** Once every step has finished, run the full build and test suite and compare against the Phase 0
result. Run the scanner with `--fail-on=error` and require exit 0. Rewrite the baseline with
`--write-baseline`. Report before and after counts per rule, plus the files deleted and the types split out.
Present a commit message and leave the commit to the user.
