---
name: quality-upgrade
description: >
  Multi-phase orchestrator that iteratively brings test quality and source code health to a target
  score (~8/10) using the test-verification and test-fixer skills in a loop. Manages 5 phases
  (baseline, fix cycles, coverage gaps, final verify, commit) with manifest.cycle as durable state
  so a compacted session resumes exactly where it left off. Enforces subagent-per-file discipline,
  SHA-256 dirty detection, targeted test runs, batch mechanical fixes, and anti-laziness gates.
  Use whenever the user says "upgrade quality", "improve quality to 8", "quality loop",
  "full quality pass", "bring tests to 8/10", "quality goal", "run the quality upgrade",
  "systematic test improvement", or wants a comprehensive, multi-cycle quality improvement
  across the entire project. Also use when the user asks to "fix everything from the verification
  report" or "address all test issues systematically".
compatibility: language-agnostic (requires test-verification and test-fixer skills)
---

# Quality Upgrade Skill

## Overview

Orchestrates `test-verification` → `test-fixer` loops across 5 phases to bring a project's test suite and source code to a target quality level. Default target: every test file at ≥8.0 overall, every source file at ≥7 observability AND ≥7 brevity, zero files below hard minimums (6.5 test, 4 source), test coverage ≥ 80%.

**Targets are per-file absolute minimums, no exceptions.** Every. Single. File. Must meet the target. No "90% is good enough" — that's how 10% of the worst files get abandoned. No file is done until it hits the target score.

**Key insight from postmortem**: Context compaction is expected. Manifest.cycle IS durable state. Never re-create tasks or restart from "Cycle 1" if manifest.cycle says Cycle 3.

This skill does NOT re-implement test-verification or test-fixer. It coordinates them — managing phase transitions, scope decisions, exit gates, and cycle boundaries. Per-file work is delegated via `Skill` tool invocations.

## Project Detection

At startup, detect the project's language, build system, and test runner. Store results in manifest under `cycle.tooling` so subsequent sessions don't re-detect.

### Detection by config file (check in order):

| Config file | Language | Full test suite | Single-file test | Compile check |
|-------------|----------|----------------|------------------|---------------|
| `package.json` with `"test"` script | JS/TS | `npm test` | `npx jest <file>` / `npx vitest run <file>` / `node --test <file>` (detect framework from package.json) | `npx tsc --noEmit` (TS) or skip (JS) |
| `Cargo.toml` | Rust | `cargo test` | `cargo test <test_name>` | `cargo check` |
| `*.csproj` / `*.sln` | C# | `dotnet test` | `dotnet test --filter <test_name>` | `dotnet build --no-restore` |
| `go.mod` | Go | `go test ./...` | `go test -run <TestName> ./<package>` | `go build ./...` |
| `pyproject.toml` / `setup.cfg` | Python | `pytest` / `python -m pytest` | `pytest <file>::<test_name>` | skip (interpreted) |
| `Gemfile` | Ruby | `bundle exec rspec` / `bundle exec rake test` | `bundle exec rspec <file>:<line>` | skip (interpreted) |
| `Makefile` with `test` target | Any | `make test` | varies | `make build` / `make check` |

### Detection procedure:

1. Run `ls` / `Glob` for each config file in project root
2. If multiple match (e.g., `Cargo.toml` + `package.json` in monorepo): pick the one closest to `src/` or ask user
3. If none match: ask user for test command
4. Store in manifest:
   ```json
   {
     "cycle": {
       "tooling": {
         "language": "typescript",
         "test_framework": "node-test",
         "full_test_command": "npm test",
         "single_test_command": "node --experimental-test-module-mocks --test {file}",
         "compile_check_command": "npx tsc --noEmit",
         "build_output_dir": "dist/"
       }
     }
   }
   ```

### Single-file test command patterns:

The `{file}` placeholder in `single_test_command` gets replaced with the test file path. Framework-specific patterns:

| Framework | Pattern |
|-----------|---------|
| Node built-in test | `node --test {file}` |
| Jest | `npx jest {file}` |
| Vitest | `npx vitest run {file}` |
| Cargo test | `cargo test -- {test_name}` (test name extracted from file) |
| dotnet test | `dotnet test --filter "FullyQualifiedName~{test_name}"` |
| go test | `go test -run {TestName} ./{package}` |
| pytest | `pytest {file} -k {test_name}` |

The `test-verification` and `test-fixer` skills handle per-file test execution internally using their own detection — this skill only needs the full suite command for cycle boundary gates.

## Hard Constraints (postmortem-derived — violations = loop breaks)

| Rule | Why |
|------|-----|
| Manifest SHA-256 is the ONLY dirty-detection source | `git status` tells nothing about verification state |
| Run full test suite ONLY at cycle boundaries | Single-file tests per fix; full suite at each cycle boundary gate |
| Spawn subagents for verification, never inline | Context starvation → 5× token waste |
| Create tasks once, update status, never delete+recreate | If re-creating "Cycle 1", read manifest.cycle instead |
| First action every turn: read manifest.json, check cycle.phase + cycle.last_file_processed | Compaction means you don't remember where you are |
| A fix is NOT complete until manifest hash is written | Edit → test → write hash, same turn |
| Batch 3+ identical mechanical fixes into one agent | "Add diagnostic messages to 8 files" = 1 agent, not 8 |
| Never change WHAT is tested, only HOW | Improve assertions on existing behavior, don't change behavior |

## Target Configuration

Defaults (override per user request). **All targets are parallel gates — passing test quality without passing source quality is NOT complete.**

| Metric | Default target |
|--------|---------------|
| Test files at target (overall ≥ 8.0) | Every file — 100% |
| Minimum per-test-file overall | ≥ 6.5 (hard floor — AND no single dimension below 4) |
| Source files at observability target (≥ 7) | Every file — 100% |
| Source files at brevity target (≥ 7) | Every file — 100% |
| Minimum per-source-file (obs & brevity) | ≥ 4 |
| Test coverage (file-based) | ≥ 80% |
| Line coverage (where toolchain supports) | ≥ 70% |
| Branch coverage (where toolchain supports) | ≥ 50% |
| Max fix cycles | 5 (ask user before exceeding) |
| Fix threshold | overall < 8.0 (fix ALL files below target, worst first, test AND source) |

User can override: "upgrade quality to 9/10", "target 85% coverage", "max 3 fix cycles", "all files must be ≥7".

## Phase Flow

```
master → quality/upgrade (branch created, Phase 1)
  ├── Phase 1 (baseline commit)
  ├── Phase 2 (cycle 1 commit, cycle 2 commit, ...)
  ├── Phase 3 (coverage commit)
  ├── Phase 4 (final verify)
  └── Phase 5 (final report, merge back to master)
```

All work commits to `quality/upgrade`. `master`/`main` untouched until merge.

Each phase sets `cycle.phase` in manifest.json. A fresh session reads manifest.json first and resumes from the current phase. No re-doing completed phases.

---

## Pre-Flight: Git Setup

Before Phase 1 begins, set up the git workspace:

1. Verify working directory is clean (no uncommitted changes that aren't part of this upgrade):
   ```bash
   git status --porcelain
   ```
   If dirty: ask user. "Working directory has uncommitted changes. Commit/stash them first, or include them in the upgrade branch?"

2. Create the cleanup branch from current HEAD:
   ```bash
   git checkout -b quality/upgrade
   ```
   Branch name default: `quality/upgrade`. User can override: "use branch name X".

3. Store branch info in manifest for session handoff:
   ```json
   {
     "cycle": {
       "cleanup_branch": "quality/upgrade",
       "base_branch": "<current branch before checkout>"
     }
   }
   ```
   `base_branch` is recorded so the final report can compute `git diff <base>..quality/upgrade` and the merge step knows where to merge back to.

---

## Phase 1: Establish Baseline

**Entry condition**: manifest.json absent OR `cycle.phase` not set to "fix"/"coverage"/"final-verify"/"commit"
**Exit condition**: manifest.json with all test files verified, coverage mapped, source files analyzed
**Sets**: `cycle.phase = "fix"`, `cycle.cycle_number = 1`

### Actions

1. Invoke test-verification skill with `--force` (verify ALL files, skip no hashes):
   ```
   Skill("test-verification", "--force --full")
   ```
   This runs: discovery → verification subagents → objective scans → coverage mapping → manifest write → dashboard

2. After test-verification completes, read manifest.json to confirm:
   - All test files have scores and hashes
   - Coverage section populated with untested_files
   - Source quality section populated with observability/brevity scores
   - Dashboard generated at `.claude/test-verification/dashboard.html`

3. If any of the above missing, re-invoke test-verification for the missing section.

4. Set in manifest: `cycle.phase = "fix"`, `cycle.cycle_number = 1`, `cycle.started_at = <ISO timestamp>`, `cycle.target_files_at_target = "all"`, `cycle.target_min_file = 6.5`, `cycle.target_coverage = 0.80`

5. Commit baseline to the cleanup branch:
   ```bash
   git add .claude/test-verification/
   git commit -m "chore(quality): establish baseline — N files, N below 6.5, N below 8.0, Y% coverage"
   ```

6. Report:
   ```
   ## Baseline Established (branch: quality/upgrade)
   Test files: N · At target (≥8.0): N (X%) · Below 6.5: N
   Source files: M · Observability issues: O · Brevity issues: B
   Files below minimum: N
   Untested (high+medium risk): J
   Baseline committed. Starting Phase 2 (fix loop).
   ```

DO NOT proceed to Phase 2 until manifest is written with all baseline data and baseline commit is made.

---

## Phase 2: Fix Loop (Cycles 1..N)

**Entry condition**: `cycle.phase = "fix"`
**Exit condition**: every test file at ≥8.0 AND every source file at ≥7 observability AND every source file at ≥7 brevity AND zero test files < 6.5 AND zero source files < 4 AND source anti-patterns addressed (empty catches, missing logs, CC>5, unnecessary else). No percentages — "close enough" is not done.
**Exit gate**: full test suite passes (`{full_test_command}` from manifest.cycle.tooling), dashboard regenerated

### Per-Cycle Structure

#### 2a. Determine Scope

Read manifest.json. Sort test files AND source files by score ascending, worst first. Read `cycle.cycle_number` and `cycle.files_fixed_this_cycle`.

**Scope = all files below their target threshold.** Source files and test files are both in scope — neither lane can be deferred. Fix both test AND source files in each cycle.

**Test file scope:**
- Always: fix ALL test files with overall < `cycle.target_min_file` (hard minimum)
- Default: fix test files with overall < 8.0 (target threshold)
- Skip files already in `cycle.files_fixed_this_cycle`

**Source file scope:**
- Always: fix ALL source files with observability < 4 OR brevity < 4 (hard minimum)
- Default: fix source files with observability ≤ 6 OR brevity ≤ 6
- Source files with anti-patterns (empty catches, zero logs, CC>5, unnecessary else, low replacement ratio) are in scope regardless of score

**Capacity management:**
- If combined scope >30 files: batch the worst 15 test + worst 15 source this cycle, queue the rest for subsequent cycles. Batching is fine — each cycle tackles a manageable chunk.
- Interleave test + source fixes — don't finish all test files before touching source
- **Batching does NOT mean the remaining files are done.** The process is NOT complete until every single file meets the target. Small steps each cycle, but thorough — no file gets abandoned because "it was in a later batch."
- After all files are at target, expand to fill coverage gaps (Phase 3)

Sort test files by overall score ascending. Sort source files by `min(observability.score, brevity.score)` ascending (worst dimension determines priority).

Set `cycle.files_to_fix` = list of file paths in processing order (interleaved test/source).

Report scope before touching any files:
```
Cycle N scope:
  TEST: N/M at target (≥8.0)  ·  K below minimum (<6.5)  ·  X to fix this cycle
  SOURCE: P/Q at obs target (≥7)  ·  R below obs minimum  ·  Y to fix this cycle
         P'/Q at brevity target (≥7)  ·  R' below brevity minimum
  Worst test file: path (overall: X.X)
  Worst source file: path (obs: X.X, brevity: Y.Y)
  Estimated fix agents: T
Proceed? (y/n)
```

Wait for confirmation. Do not proceed without it.

#### 2b. Fix Test Files (Sequential, Worst First)

For each test file in scope:

1. Read the file
2. Read its findings from manifest
3. **Batch check**: If this file + 2+ other pending files share the same low-dimension issue AND the fix is mechanical, batch them into ONE subagent. Skip individual processing for batched files.
4. Invoke test-fixer skill for this specific file:
   ```
   Skill("test-fixer", "fix <filepath> — only this file, apply all findings")
   ```
   The test-fixer skill spawns a fix subagent, applies the returned code, runs targeted test, and updates manifest hash.

5. If test-fixer reports test failure after fix: diagnose, fix, re-run targeted test. Do not proceed with broken test.
6. Mark `cycle.last_file_processed = "<path>"` in manifest
7. Push path to `cycle.files_fixed_this_cycle[]` in manifest

**Anti-laziness gate**: After each fix, verify that ALL findings were addressed. If test-fixer skipped findings, note them. If a finding was skipped because "it seems fine," challenge that — the verification agent found it for a reason.

#### 2c. Fix Source Files

For each source file in scope:

1. Read the file
2. Read its `source_quality` entry from manifest
3. Fix directly (source fixes are mechanical, no subagent needed):

**Observability fixes** (when `observability.score ≤ 6`):
- Empty catch blocks → add a log statement (at minimum) explaining what was caught and why it's safe. Use the project's logging convention (see table below).
- Error handlers without logging → add a log before return/throw. Include the error object and relevant context (IDs, operation name).
- Bare static log messages (no variable interpolation) → add context: error objects, relevant IDs, operation state.
- Zero-log files (>20 lines) → add logging at entry points, error paths, and external call boundaries.

**Logging by language** (use project conventions; these are sensible defaults):

| Language | Error log | Debug/info log |
|----------|-----------|----------------|
| JS/TS | `console.error("ctx", { error: e, ... })` | `console.debug("ctx", { ... })` |
| Rust | `log::error!("ctx: {e:?}");` or `tracing::error!(error = ?e, "ctx");` | `log::debug!` / `tracing::debug!` |
| C# | `_logger.LogError(e, "ctx {Id}", id);` | `_logger.LogDebug("ctx {Id}", id);` |
| Python | `logging.error("ctx: %s", e, extra={...})` | `logging.debug(...)` |
| Go | `slog.Error("ctx", "error", err, "id", id)` | `slog.Debug(...)` |
| Ruby | `Rails.logger.error("ctx: #{e.message}")` | `Rails.logger.debug(...)` |

**Brevity fixes** (when `brevity.score ≤ 6`):
- Functions >30 lines → split at logical boundaries into smaller focused functions
- High cyclomatic complexity (CC > 5) → extract decision-heavy blocks into helper functions
- Unnecessary else (else after return/throw/break/continue) → remove else, de-indent body (guard clause)
- Avoidable else (if/else pairs, zero guard clauses) → refactor if-branch to exit early, eliminate else
- Lines >120 chars → break expressions, extract conditions into named variables
- Files >300 lines → extract related functions into new module
- Low replacement ratio (<0.2, net >10 added lines) → check for dead code paths, remove if confirmed dead

**Constraint**: Do NOT change behavior. Adding a log is safe. Splitting a function at a logical boundary is safe. Do NOT refactor logic or change API signatures.

4. Run compile check (`{compile_check_command}` from manifest.cycle.tooling) to verify compilation (source changes may introduce type errors)
5. Compute SHA-256, update manifest.source_quality[path].hash
6. Mark cycle.last_file_processed, push to cycle.files_fixed_this_cycle

#### 2d. Re-Verify After Fix Batch

After ALL files in this cycle's scope are fixed:

1. Invoke test-verification skill on changed files only (no `--force` — manifest hashes detect changes):
   ```
   Skill("test-verification", "re-verify changed files from cycle N")
   ```
   This re-verifies only files whose hashes differ from manifest, updates scores, regenerates dashboard.

2. After re-verify completes, read manifest.json to get updated scores.

3. **Regression check**: For each fixed file, compare new score vs previous score in `cycle.files_fixed_this_cycle`. If any file got worse:
   ```
   ⚠ file.test.ts: overall dropped 6.8→5.9. determinism dropped 7→3. Review needed.
   ```
   Investigate before proceeding. If regression is real, fix it or revert.

4. Calculate files remaining below target. Update `cycle.files_below_target`, `cycle.files_below_minimum`.

5. Report cycle summary:
   ```
   ## Cycle N Complete
   Files fixed: X test + Y source
   Score improved: Z files  ·  Score unchanged: W files  ·  Score regressed: V files (list with details)
   Files at target (≥8.0): N/M (was N/M) → need M−N more
   Files below minimum (<6.5): K (was L) → zero is the target
   Remaining below threshold: N files (must reach zero)
   ```

#### 2e. Cycle Boundary Check + Commit

Run full test suite (`{full_test_command}` from manifest.cycle.tooling). Must pass before entering next cycle or phase.

**Commit cycle checkpoint** to `quality/upgrade` branch. Group changes into logical commits:

```bash
# 1. Test quality improvements
git add <changed test files>
git commit -m "fix(test): cycle N — improve assertion quality and diagnostics (N files, N→N at target)"

# 2. Source code quality improvements (if any source files were fixed)
git add <changed source files>
git commit -m "fix(source): cycle N — address observability/brevity anti-patterns"

# 3. Dashboard + manifest
git add .claude/test-verification/
git commit -m "chore(quality): cycle N — update dashboard and manifest (N files below target, K below minimum)"
```

If only one category of changes exists (e.g., only test files, no source files), combine into a single commit:
```bash
git add -A
git commit -m "fix(quality): cycle N — X test files improved, N→M below target (−Z resolved)"
```

**Commit message conventions**:
- Use `fix(quality):` prefix for fix cycles (these are corrective improvements)
- Use `feat(test):` for new test files (coverage gap fills)
- Use `chore(quality):` for dashboard/manifest/report updates
- Always include cycle number or phase for traceability
- Always include files-at-target delta and below-minimum count in body or summary line
- Never commit on `master`/`main` — all commits go to `quality/upgrade` (check `cycle.base_branch` in manifest)

Then evaluate exit conditions (in order):
1. Every test file at ≥8.0 AND every source file at ≥7 obs AND every source file at ≥7 brevity AND zero files below hard minimums → set `cycle.phase = "coverage"`, proceed to Phase 3
2. Any test OR source file still below target → increment `cycle.cycle_number`, keep `phase = "fix"`, go to 2a
3. `cycle.cycle_number ≥ 5` → ask user: "Improvement plateaued after 5 cycles. Files at target: N/M test, P/Q source. Files below minimum: K. Continue or adjust target?"
4. Files below threshold unchanged for 2+ cycles → ask user: "Improvement plateaued — N test + P source files stuck below target for 2 cycles. Continue or adjust threshold?"
5. All files at target (test ≥8.0, source ≥7) → proceed directly to Phase 3

---

## Phase 3: Fill Coverage Gaps

**Entry condition**: `cycle.phase = "coverage"`
**Exit condition**: coverage ≥ 80% OR all high+medium risk gaps filled AND line coverage ≥ 70% AND branch coverage ≥ 50%
**Exit gate**: generated tests pass, manifest updated, dashboard regenerated

### Actions

1. Read `manifest.coverage.untested_files`, `manifest.coverage.possibly_tested`, and `manifest.coverage.weakly_covered` (files with tests but low line/branch coverage).

2. Filter to high and medium risk only. Skip:
   - Low risk items
   - `entry_points_untested` items (unless user explicitly asked "test everything")
   - Files < 10 lines (trivial config/constants)

3. **Prioritize by coverage gap**: Sort files with line_coverage_pct available by lowest coverage first. Weakly covered files (has tests but <50% line coverage) may need additional tests more urgently than completely untested small utility files.

4. Report scope:
   ```
   ## Coverage Gap Fill
   High risk (no tests): N files
   Medium risk (no tests): M files
   Weakly covered (<50% line coverage): W files
   Possibly tested (weak match): P files
   Low risk / entry points (skipped): K files
   Line coverage: X% → target: 70%+
   Branch coverage: Y% → target: 50%+
   Proceed? (y/n)
   ```

4. For each file, sequentially:

   a. Read the source file fully
   b. Determine test file location from project conventions (mirror source structure, pick right test directory)
   c. Invoke test-fixer skill for coverage gap:
      ```
      Skill("test-fixer", "generate test for <source-path> — fill coverage gap")
      ```
      The test-fixer skill reads the source, spawns a generation subagent, writes the test file, and runs it.

   d. If generated test fails: fix it. A failing generated test is worse than no test.
   e. Verify the generated test file's quality (spawn a verification subagent for the new file)
   f. Update manifest: add test file to `files[]`, mark source as tested in `coverage[]`

5. After all gaps filled:
   - Regenerate coverage mapping: invoke `Skill("test-verification", "coverage-only")`
   - Generate dashboard
   - Report coverage improvement

6. Run full test suite (`{full_test_command}` from manifest.cycle.tooling). Must pass.

7. Commit coverage work:
   ```bash
   git add <new test files> .claude/test-verification/
   git commit -m "feat(test): add tests for N previously untested modules (coverage +X%)"
   ```

8. Set `cycle.phase = "final-verify"`

---

## Phase 4: Final Verification Pass

**Entry condition**: `cycle.phase = "final-verify"`
**Exit condition**: full re-verification complete, final scores confirmed
**Exit gate**: all tests pass (`{full_test_command}` from manifest.cycle.tooling), dashboard regenerated

### Actions

1. Run full test suite (`{full_test_command}` from manifest.cycle.tooling) — gate check. Must pass.

2. Invoke test-verification with `--force` (re-verify EVERY file from scratch):
   ```
   Skill("test-verification", "--force --full")
   ```
   Every test file gets a fresh subagent verification. No hash skipping.

3. After verification completes, read manifest.json for final scores.

4. If any file is not at target OR any file below minimum:
   - Report gap: "N test files below 8.0. P source files below 7. K files below hard minimum."
   - Ask user: "Continue with another fix cycle (Phase 2) or accept current scores?"
   - If continue: set `cycle.phase = "fix"`, increment `cycle.cycle_number`, return to Phase 2
   - If accept: proceed to Phase 5

5. Report:
   ```
   ## Final Quality Assessment
   Test files: N · Below 8.0: M · Below 6.5: K
   Source files: P · Below obs 7: Q · Below brevity 7: R · Below 4: S
   Files below target (must reach zero): N test + P source
   Score distribution: 9-10: N · 8-8.9: N · 7-7.9: N · 6-6.9: N · <6: N
   Files below 6.5: N (list with scores and worst dimension)

   ### Improvement from baseline
   Below target: N+M → N+M (−Z files resolved)
   Below minimum: K → L (−W files)
   Files improved: N/N
   Coverage: Y% → X% (+Z pp)
   ```

6. Set `cycle.phase = "commit"`

---

## Phase 5: Final Report and Merge

**Entry condition**: `cycle.phase = "commit"`
**Exit condition**: final report written, branch ready for merge
**Exit gate**: all commits are on `quality/upgrade` branch, clean working directory

All per-cycle and per-phase commits already made on `quality/upgrade`. This phase writes the final report and prepares for merge-back.

### Actions

1. Verify all changes committed:
   ```bash
   git status --porcelain  # must be clean
   git log --oneline <base-branch>..quality/upgrade  # list all upgrade commits
   ```

2. Write final commit (if any straggling files):
   ```bash
   git add .claude/test-verification/final-report.md .claude/test-verification/dashboard.html .claude/test-verification/manifest.json
   git commit -m "chore(quality): final report — N files below target remaining, Y% coverage, N commits"
   ```

3. Write final report to `.claude/test-verification/final-report.md`:
   ```markdown
   # Quality Upgrade Report
   **Date**: <ISO timestamp>
   **Branch**: `quality/upgrade`
   **Cycles**: N
   **Target**: every test file ≥8.0, every source file ≥7 obs + ≥7 brevity, zero below minimums, Z% coverage

   ## Results
   | Metric | Baseline | Final | Δ |
   |--------|----------|-------|---|
   | Files at target (≥8.0) | N | M | −Z remaining |
   | Files below minimum (<6.5) | N | M | −Z |
   | Coverage (file-based) | X% | Y% | +Z pp |
   | Line coverage | X% | Y% | +Z pp |
   | Branch coverage | X% | Y% | +Z pp |

   ## Per-File Improvements
   | File | Baseline | Final | Δ |
   |------|----------|-------|---|

   ## Coverage Gaps Filled
   - List of new test files created

   ## Remaining Issues
   - Any files still below target and why (architectural changes needed, etc.)

   ## Commits on `quality/upgrade`
   - List of commits in this upgrade
   ```

4. Display branch summary:
   ```
   ## Quality upgrade complete
   Branch: quality/upgrade · N commits
   Base: <base-branch> · Ahead by: N commits
   Files at target (≥8.0): N/M · Below minimum: K
   Coverage: Y%
   Report: .claude/test-verification/final-report.md
   Dashboard: .claude/test-verification/dashboard.html

   To merge: git checkout <base-branch> && git merge quality/upgrade
   To review: git diff <base-branch>..quality/upgrade
   ```

5. Set `cycle.phase = "done"`, `cycle.completed_at = <ISO timestamp>` in manifest

6. **Do NOT merge automatically** — ask user. "Merge `quality/upgrade` into `<base-branch>` now?"

---

## Session Handoff Protocol

When a new session starts and this skill is invoked:

1. Read `.claude/test-verification/manifest.json`
2. Checkout the cleanup branch:
   ```bash
   git checkout <manifest.cycle.cleanup_branch>
   ```
   If branch doesn't exist locally (fresh clone, different machine): create it from the stored base.
3. Check `cycle.phase` — this IS your current position in the flow
4. Check `cycle.last_file_processed` — resume from the next file after this one
5. Check `cycle.files_verified_this_cycle` and `cycle.files_fixed_this_cycle` — these ARE done, skip them
6. Check `cycle.files_to_fix` — this is the remaining work queue for this cycle
7. Report: "Resuming [phase], Cycle [N] on branch [cleanup_branch]. Last: [file]. Done this cycle: [X/Y]."
8. Continue from exactly where manifest.cycle says you are

**Never**: "Let me start from the beginning to make sure..." — manifest.cycle IS the beginning. Trust it.

**Never**: "Let me run test-verification again to see where we are..." — manifest.json has scores, hashes, and phase. Read it.

## Anti-Laziness Gates

These are checked at every phase transition and cycle boundary:

1. **Fix ALL findings per file** — not just the easiest one. If a file has 8 findings at severity medium+, address all 8. Don't "fix diagnostics and call it done" when assertion_quality is also 4.
2. **Subagent per file for verification** — always. Inline verification is banned. The test-verification skill enforces this; this skill ensures the skill is invoked per-file.
3. **Source AND test files both verified** — never complete Phase 1 without source quality analysis populated for all production files. Empty `source_quality` in manifest = incomplete baseline. Block Phase 2 until source analysis exists.
3. **No skipping "because it's close enough"** — 7.7 is not 8.0. Never. A file at 7.9 is below target. Fix it until it's ≥8.0. The exit condition is absolute: `score >= 8.0`, not `score ~= 8.0`.
4. **No batch-verifying** — each test file gets its own verification subagent.
5. **Classification completeness required** — before writing any manifest entry, verify `classifications` is non-empty for that file. Empty `classifications: {}` = no subagent ran = invalid verification. Respawn subagents for any files missing classifications before proceeding to scores or commits.
6. **Regenerate dashboard after every cycle** — don't defer to "later."
7. **Run targeted test after every fix** — never assume it passes. The test-fixer skill does this; verify it happened.
8. **Write manifest hash after every fix** — never defer to batch update.
9. **If a fix makes a score worse, investigate before proceeding** — don't just log it and move on. Find why.
10. **Every cycle must decrease files below minimum** — if files below 6.5 don't decrease, something is wrong. Investigate.
11. **Full test suite at every cycle boundary** — no exceptions. Use `{full_test_command}` from manifest.cycle.tooling.

## Tool Selection for Fixes

| Finding type | Tool to use |
|-------------|------------|
| Weak assertions (truthiness >30% of total) | `Skill("test-fixer", "fix assertion quality in <file>")` |
| Flake risks (any determinism flag true) | `Skill("test-fixer", "fix determinism in <file>")` |
| Missing error/edge coverage (coverage_depth ≤ 5) | `Skill("test-fixer", "fix coverage depth in <file>")` |
| Poor diagnostics (assertions_without_message >70%) | `Skill("test-fixer", "fix diagnostics in <file>")` |
| Trivial assertions (> 0 trivial) | `Skill("test-fixer", "fix trivial assertions in <file>")` |
| Multiple metrics below threshold | `Skill("test-fixer", "fix <file> — all findings")` |
| Source observability (score ≤ 6) | Direct edit (mechanical: add logging, fix catch blocks) |
| Source brevity (score ≤ 6) | Direct edit (mechanical: split functions, wrap lines) |
| Missing test (coverage gap) | `Skill("test-fixer", "generate test for <source-path>")` |

## Integration with /goal Loop

This skill is designed to be invoked inside `/goal` or `/loop`:

```
/goal Run the quality upgrade skill to bring tests to 8/10
```

Or directly:
```
/quality-upgrade
```

When invoked via `/goal`, the goal loop re-invokes the skill each turn. The skill's session handoff protocol (reading manifest.cycle) ensures each turn continues from where the last one left off, even across compactions and fresh sessions.
