---
name: test-fixer
description: >
  Fix test quality issues identified by test-verification. Reads the manifest to find files scoring below a threshold,
  then applies targeted fixes for each finding (weak assertions, trivial assertions, flake risks, missing edge cases,
  poor diagnostics, observability anti-patterns, brevity violations, etc.). Also fixes source code quality issues
  (empty catches, missing error logs, long functions, high CC, unnecessary else, code accretion).
  Re-verifies fixed tests and updates the manifest. Requires test-verification to have been run first.
  Use whenever the user says "fix my tests", "improve test quality", "fix weak tests", "address test issues",
  "repair tests", "apply test fixes", "fix the test findings", "resolve test problems", or wants to act on
  test-verification results. Also trigger when the user mentions specific score dimensions to fix
  ("fix assertion quality", "fix trivial assertions", "make tests deterministic", "improve test coverage depth",
  "fix observability issues", "fix code quality", "fix brevity violations", "add logging to error handlers").
compatibility: language-agnostic (requires test-verification skill)
---

# Test Fixer Skill

## Overview

Companion to `test-verification`. Reads the manifest at `.claude/test-verification/manifest.json` and does two things:
1. **Fix existing tests** — Finds test files scoring below a configurable threshold, applies targeted fixes for each finding. Re-verifies fixed files afterwards.
2. **Fill coverage gaps** — Generates new test files for untested source files identified in the manifest.

## Prerequisites

The `test-verification` skill must have been run at least once. If `.claude/test-verification/manifest.json` doesn't exist, tell the user to run test verification first.

## Cycle State & Context Discipline

### Read Cycle State First

Read `manifest.json` before any other action — check `manifest.cycle`. This tells you:
- Current phase (verify/fix/commit), cycle number
- Which files have already been processed THIS cycle
- Hook instruction hash (for deduplication)

**No separate file.** Cycle state lives in manifest.json, which is already written after every fix (Step 4). Update cycle fields as part of the same manifest write you're already doing. No extra "remember to" step.

**If manifest.cycle.phase is "verify"**: Switch to verification phase. Don't try to fix files yet.
**If manifest.cycle.phase is "fix"**: You're in the right phase. Continue from `manifest.cycle.last_file_processed`.
**If manifest.cycle.phase is "done"**: All work complete. Report summary, ask if user wants another cycle.

Update cycle fields after each file fix (`phase: "fix"`, `last_file_processed: "<path>"`, push to `files_fixed_this_cycle`).

### Context Compaction Resilience

Context gets compacted — you WILL forget past messages. Manifest.cycle is your durable memory. Same pattern as test-verification: read manifest.json first every turn, use `cycle.phase` and `cycle.last_file_processed` to know where you are, never rely on context memory for state.

### Task List Discipline

- Create tasks once per cycle, update status, never delete and re-create.
- Task names use actual cycle number from manifest.cycle.cycle_number, not always "Cycle 1".

### SHA-256 IS the Dirty Marker

The manifest's stored SHA-256 hashes are the **sole source of truth**. Never use `git status`, `git diff`, or mtime for dirty detection. If manifest hash matches file hash, file is verified — skip it even if you "remember" editing it.

## When This Triggers

- "fix my tests" / "improve test quality" / "fix weak tests"
- "address the test findings" / "fix the issues from test verification"
- "apply test fixes" / "repair tests scoring below 6"
- "fix assertion quality in my tests" / "make tests more deterministic"
- "improve test coverage depth" / "fix flaky tests"
- "add tests for untested code" / "fill coverage gaps" / "write tests for uncovered files"
- "generate missing tests" / "create tests from coverage report"
- Any mention of acting on test-verification results

## Workflow

### Step 1: Read Manifest & Determine Scope

Read `.claude/test-verification/manifest.json`. Parse the files, their scores, and the project tooling config.

**Detect language & framework**: Read `manifest.cycle.tooling` for `language`, `test_framework`, `single_test_command`, and `full_test_command`. Use these to determine assertion style, test file conventions, and the correct test runner commands. If missing, infer from project config files (package.json, Cargo.toml, *.csproj, go.mod, etc.).

**Threshold**: Default = overall score < 7. User can override:
- "fix tests below 5" → threshold = 5
- "fix all tests below 8" → threshold = 8
- "fix the worst tests" → pick the 3 lowest-scoring files
- "fix assertion issues" → files where `truthiness_assertions > 30% of total` or `assertion_quality ≤ 5`
- "fix flaky tests" → files where `determinism ≤ 5` or any determinism flag is true
- "fix everything" → all files with any score ≤ 6
- "fix weak diagnostics" → files where `assertions_with_message / total < 30%`

**Ordering**: Sort files by overall score ascending (worst first). If dimension-specific, sort by that dimension ascending.

Report scope to user:
```
Fixing test quality issues:
  Threshold: overall < 7
  Files to fix: 8 out of 23 total
  Worst file: src/tests/parser.test.ts (overall: 3.2)

Proceed? (y/n)
```

Wait for confirmation before making any changes.

### Step 2: Fix Each File Sequentially

Process files one at a time. For each file:

1. Read the test file
2. Read the findings from the manifest for that file
3. Spawn a fix agent with this prompt template:

```
You are fixing test quality issues in a specific test file. Apply targeted fixes based on the findings provided.
Do NOT rewrite the entire file. Make minimal, surgical changes that address each finding.

## PROJECT CONTEXT
- Language: <detected language — read from manifest.cycle.tooling.language or infer from file extension>
- Test framework: <detected framework — read from manifest.cycle.tooling.test_framework or infer from imports>
- Use the project's existing assertion library, test runner conventions, and coding style.
- Adapt all fix patterns below to the detected language/framework. The examples are illustrative — translate them to the appropriate syntax and idioms.

## CRITICAL RULES
- Preserve all existing test behavior that isn't flagged as problematic
- Do not change what is being tested — only HOW it's tested
- Keep the test framework and style consistent with the existing code
- After each fix, the test must still compile/run correctly
- If a finding seems wrong or the test is actually fine, skip it and explain why

## FILE TO FIX
Path: <filepath>

## CURRENT SCORES
<list scores from manifest>

## FINDINGS TO ADDRESS
<list findings for this file from manifest>

## FIX GUIDELINES

### Weak assertions (assertion_quality)
- Replace truthiness checks (`assert(result)`, `expect(x).toBeDefined()`, `assert!(result.is_ok())`) with specific property/value checks
- Add assertions for side effects (was a function called? was state updated?)
- Split multi-behavior tests into separate test cases
- Add assertion messages that identify what failed
- Translate to project's assertion style: `assert_eq!(expected, actual)` (Rust), `Assert.AreEqual(expected, actual)` (C#), `assert.Equal(t, expected, actual)` (Go), etc.

### Flake risks (determinism)
- Mock `Date.now()`, `new Date()`, `Math.random()`
- Replace `setTimeout`/`sleep` with mocked timers or remove them
- Ensure shared state is reset in `beforeEach`
- Add transaction rollback or cleanup for database tests

### Isolation issues
- Move shared mutable setup into `beforeEach`
- Ensure each test creates its own data
- Remove dependencies on test execution order
- Add proper cleanup in `afterEach`

### Clarity
- Rename vague test names to describe exact behavior
- Add AAA comment markers if missing
- Extract magic values into named constants
- Split tests that verify multiple behaviors

### Missing edge cases (coverage_depth)
- Add test cases for null/undefined/empty inputs
- Add boundary value tests
- Add error path tests
- Add tests for unexpected input types

### Speed issues
- Remove unnecessary `sleep`/`wait` calls
- Replace real I/O with mocks where possible
- Use in-memory alternatives for databases
- Move heavy setup to `beforeAll` if shared across tests

### Poor diagnostics
- Add descriptive assertion messages
- Use custom matchers or explicit expected/actual values
- Add context to error messages

### Trivial assertions (assertion_triviality)
These are assertions that pass unconditionally — constant-on-constant comparisons that exercise zero production logic.
- Replace `assert True` / `expect(true).toBe(true)` with assertions against real variables
- Replace `assert 1 == 1` / `assert.equal(0, 0)` with actual behavioral checks
- Replace `self.assertTrue(True)` with checks against computed results
- Replace `assert.ok(true)` with meaningful condition checks
- **Rust**: Replace `assert!(true)`, `assert_eq!(1, 1)`, `assert_ne!(0, 1)` with computed conditions
- **C#**: Replace `Assert.IsTrue(true)`, `Assert.AreEqual(1, 1)`, `Assert.That(true, Is.True)` with real variable checks
- **Go**: Replace `assert.Equal(t, 1, 1)`, `assert.True(t, true)`, `require.Equal(t, 0, 0)` with behavioral assertions
- If a test has only trivial assertions, rewrite it to actually verify behavior
- If a trivial assertion is a placeholder, replace it with the real check or remove the test

### Observability anti-patterns (source files)
These are production code issues detected by static analysis.
- **Empty catch blocks** (`catch (e) { }`, `except: pass`): Add at minimum a log statement explaining what was caught and why it's safe. If truly intentional, add a comment explaining why.
- **Error handlers without logging** (catch+return with no log): Add a log.error() or logger.error() call before returning/swallowing
- **Bare static logs** (`console.error("it failed")` with no variable): Add context — include the error object, relevant IDs, or state. Change to `console.error("operation failed", { error: e, userId })`
- **Missing logs in new code**: For files with zero log statements and >20 lines, add logging at key points (entry, error paths, external calls)

### Brevity violations (source files)
These are code structure issues detected by static analysis.
- **Functions >30 lines**: Split into smaller focused functions. Extract helper methods for subtasks. Don't just move code — find logical boundaries.
- **High cyclomatic complexity** (CC > 5): Extract decision-heavy blocks into helper functions. Move nested conditions to separate predicates. Use early returns to flatten branching. Target: CC ≤ 5 per function.
- **Unnecessary else** (else after return/throw/break/continue): When an if-branch exits, remove the else and de-indent its body. This is the guard clause pattern — prefer `if (guard) return;` over `if (guard) { return; } else { ... }`.
- **Avoidable else** (if/else pairs, zero guard clauses): Refactor the if-branch to exit early so the else can be eliminated. This is an advisory suggestion — the function works but could be cleaner with guard clauses.
- **Files >300 lines**: Extract related functions into a new module/file. Look for natural groupings (e.g., parsing, validation, formatting).
- **Lines >120 chars**: Break long expressions across multiple lines. Extract complex conditions into named variables.
- **Low replacement ratio** (<20% deletions vs insertions, net >10 added lines): Code accretion — new code layered on top without removing old. Check if old code paths are now dead and can be deleted. Every addition should have a corresponding removal if it replaces old behavior.

## OUTPUT

Return a JSON object:
{
  "file": "<path>",
  "changes": [
    {"finding_index": N, "action": "fixed|skipped|partial", "what_changed": "brief description of the edit"}
  ],
  "new_code": "<the full updated file content>",
  "notes": "<any context the reviewer needs>"
}
```

### Step 3: Apply + Verify + Commit Manifest (ATOMIC — do all three in same turn)

Apply the returned code to the file. Use exact string replacement or full file rewrite.

**A fix is NOT complete until the manifest hash is updated.** These three actions are one atomic unit — do them all in the same turn, before moving to the next file:

1. **Edit file** (apply the fix)
2. **Run test**: single-file test only — use the project's test runner to execute just this file. Never run the full test suite here. Command depends on language/framework: `cargo test <name>`, `dotnet test --filter <name>`, `node --test <file>`, `pytest <file>`, `go test -run <Name> ./<pkg>`, etc.
3. **Write manifest**: compute SHA-256 of the fixed file, update manifest hash + scores + cycle.last_file_processed

If any of these fails, fix it before continuing. If compaction hits and you forget what you did, the hash recovery mechanism saves you: stale hash → re-verify just that file, not everything.

Then spawn a verification agent for just this file. Compare new scores vs old, update manifest.

If a dimension got worse, flag it:
```
⚠ parser.test.ts: determinism dropped 7→5 after fix. Review needed.
```

**Full test suite** only at cycle boundaries: after all files fixed AND before commit. Gate check, not per-file.

### Step 5: Summary Report

After all files processed:

```
## Test Fix Summary

Files fixed: 8/8
Scores improved: 7 files
Scores unchanged: 0 files
Scores worsened: 1 file (parser.test.ts — needs review)

### Before → After (Overall)
- parser.test.ts: 3.2 → 7.1 (+3.9)
- auth.test.ts: 4.5 → 6.8 (+2.3)
- utils.test.ts: 5.1 → 7.5 (+2.4)
...

### Skipped Findings
- api.test.ts finding #2 (isolation): Requires architectural change to shared DB — out of scope

Files improved: 7/8  ·  Files now at target (≥8.0): 4/8 (+3)
Dashboard: .claude/test-verification/dashboard.html
```

## Safety Guards

1. **Never change what's tested** — only how. Fixing assertion quality means better assertions on the SAME behavior, not asserting different behavior.
2. **Don't remove tests** — even weak ones. Improve them, don't delete them (unless they're exact duplicates).
3. **Confirm before fixing** — show the scope and get user approval before any edits.
4. **One file or batch at a time** — fix → verify → report → next. Use batch mode only for mechanical fixes (see Mode: Batch Mechanical Fixes). Never batch semantic fixes (edge cases, determinism, coverage).
5. **Flag regressions immediately** — if a fix makes a score worse, stop and ask before continuing to next file.

## Mode: Single File

"fix tests/auth.test.ts" → skip scope discovery, fix only that one file.

## Mode: Dimension-Specific

"fix assertion quality in my tests" → filter to files where `assertion_quality ≤ 5`, fix only that dimension.
"fix trivial assertions" → filter to files where `assertion_triviality ≤ 5` or `trivial_assertions > 0`.
"fix observability issues" → target source files with observability score ≤ 5 in `source_quality`.
"fix brevity violations" → target source files with brevity score ≤ 5 in `source_quality`.
"fix code quality" → target all source files with observability OR brevity score ≤ 5.

## Mode: Batch Mechanical Fixes

When 3+ files share the same low-dimension issue AND the fix is mechanical (same pattern applied to each), batch them:

1. Create a single fix agent with a list of files + the shared finding pattern
2. Agent returns all fixed file contents in one JSON response
3. Apply all fixes, then run targeted tests for each file
4. This replaces N sequential fix cycles with 1 batch cycle

**Qualifies as mechanical**: "add diagnostic messages to all assertions", "wrap long lines to ≤120 chars", "add console.debug to zero-log files", "replace process.stderr.write with console.error"
**NOT mechanical**: "add edge case tests for boundary values", "improve assertion specificity", "rewrite for determinism"

Batch only when the fix is pattern-match-and-replace, not when it requires understanding test semantics.

## Mode: Dry Run

"show me what you'd fix" / "dry run test fixes" → run scope discovery and show the plan, but don't apply any changes. Show each file, its scores, and what would be fixed.

## Hard Rules (Anti-Patterns)

Same rules as test-verification, plus fixer-specific:

| Rule | Rationale |
|------|-----------|
| **Never use `git status` for dirty detection** | Manifest SHA-256 only. |
| **Never read a file you already read this cycle** | Manifest hash tells you if it changed. |
| **Never run full test suite more than once per cycle** | Single-file tests per fix; full suite at cycle boundary. |
| **Never delete and re-create tasks** | Update status only. |
| **Never skip manifest.cycle** | First action every turn: read manifest.json, check cycle.phase and cycle.last_file_processed. Compaction means you don't remember where you are. |
| **Batch mechanical fixes** | 3+ identical-mechanic fixes → one agent, not N. |
| **Never change what's tested** | Improve HOW, not WHAT. Flag behavior-changing fixes for review instead. |
| **A fix is NOT complete until manifest hash is written** | Edit → test → write hash. Same turn. If compaction hits between edit and hash-write, hash recovery catches it next run — but that's wasted work. Write the hash. |

## Mode: Fill Coverage Gaps

Trigger: "add tests for untested code", "fill coverage gaps", "write tests for uncovered files", "generate missing tests".

### Scope

Read `MANIFEST.coverage.untested_files` sorted by risk descending (high → medium → low). Skip entry points unless user explicitly requests ("test everything including entry points").

**Threshold**: Default = high and medium risk files. User can override:
- "test everything untested" → all risk levels
- "test only high risk gaps" → high risk only
- "write a test for src/utils/retry.ts" → single file

Report scope:
```
Generating tests for coverage gaps:
  High risk (no tests): 3 files
  Medium risk (no tests): 5 files
  Low risk / entry points (skipped): 4 files

  Files to generate:
  1. src/utils/retry.ts (42 lines, HIGH) — No matching test
  2. src/auth/token.ts (67 lines, HIGH) — No matching test
  ...

Proceed? (y/n)
```

### Generation Process

For each untested source file, sequentially:

1. **Read the source file** fully to understand what it exports and does
2. **Determine the test file location** using the project's conventions (mirror the source structure, pick the right test directory). Language-specific defaults:
   - Rust: `src/foo/bar.rs` → `src/foo/bar_test.rs` or `tests/foo/bar_test.rs`
   - C#: `Services/Foo.cs` → `Services/FooTests.cs` or `Tests/Services/FooTests.cs`
   - Go: `pkg/foo/bar.go` → `pkg/foo/bar_test.go` (same package)
   - Python: `src/foo/bar.py` → `tests/test_bar.py` or `tests/foo/test_bar.py`
   - JS/TS: `src/foo/bar.ts` → `src/foo/bar.test.ts` or `src/foo/__tests__/bar.test.ts`
3. **Spawn a generation agent** with this prompt:

```
You are writing a NEW test file for a source file that currently has zero test coverage.
Study the source code and generate a high-quality test file.

## SOURCE FILE
Path: <path>
Language: <detected from file extension or project config>
Content:
<source file content>

## PROJECT TEST CONVENTIONS
Test framework: <inferred from existing tests or project config>
Test file naming: <pattern used in this project — e.g., *_test.rs, .test.ts, _test.py, Test*.cs>
Test location: <where the test file should go — mirror source structure>
Assertion library: <inferred from project — e.g., built-in assert!, FluentAssertions, testify>

## REQUIREMENTS

Write tests that:
1. Cover every exported function/method at minimum (happy path)
2. Cover key error paths and edge cases (null/nil/empty, boundary values)
3. Use specific assertions — check exact values, not just truthiness/IsTrue/assert!
4. Are deterministic — mock time/random/network if the source uses them
5. Are isolated — each test creates its own state, no order dependencies
6. Follow AAA (Arrange-Act-Assert) pattern with clear names
7. Match the project's existing test style (framework, assertion library, naming, module/namespace conventions)
8. Use the language's standard test organization: `#[cfg(test)] mod tests { }` (Rust), `namespace Tests` (C#), same-package `_test.go` (Go), etc.

## OUTPUT

Return a JSON object:
{
  "source_file": "<path>",
  "test_file_path": "<where the test file should go>",
  "test_code": "<the full test file content>",
  "coverage_plan": ["<list of behaviors tested>"],
  "notes": "<any assumptions or limitations>"
}
```

4. **Write the test file** to the determined location
5. **Run the test** to verify it passes (if possible — skip if missing dependencies)
6. **Update manifest** — mark the source file as tested in coverage data, add the new test file to `files` with initial scores, regenerate dashboard

### Safety for Coverage Gap Filling

1. **Never overwrite existing test files** — if a test file already exists at the target path, pick a different name or ask the user
2. **Preserve project conventions** — match the test framework, directory structure, and naming patterns of existing tests
3. **One source file at a time** — generate → verify → report → next
4. **Flag assumptions** — if the agent makes assumptions about behavior that aren't obvious from the source, note them
5. **Run the test** — if the generated test fails, fix it before moving on. A failing generated test is worse than no test
