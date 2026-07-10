---
name: test-verification
description: >
  Verify and score test file quality across 8 dimensions (assertion quality, determinism, isolation, clarity,
  coverage depth, speed, diagnostics, assertion triviality). Maintains a manifest of test files with content
  hashes to detect changes, then sequentially audits changed tests via subagents for classification
  (LLMs classify patterns — scores computed by deterministic formula) plus objective static analysis for
  trivial assertions, determinism, speed, isolation, clarity, and diagnostics. Also runs source code quality analysis (observability,
  brevity) on production files. Generates a scored manifest and an HTML dashboard with three tabs.
  Use whenever the user mentions test quality, test verification, test audit, test review, "are my tests good",
  "check my tests", "verify test suite", "audit tests", "test health", or wants to assess the quality of their
  test files. Also use when the user asks to score, rate, evaluate, or improve their tests.
  Even if the user doesn't say "verify" explicitly — if they ask about test quality or whether tests are effective, trigger this skill.
compatibility: language-agnostic (detects test files by naming convention)
---

# Test Verification Skill

## Overview

This skill answers three questions:
1. **Are tests good?** — Scores every test file across 8 quality dimensions via deterministic formulas. Metrics extracted by static analysis + LLM classification checklist (LLMs classify patterns, formulas compute scores).
2. **Is everything tested?** — Detects source files with no matching test coverage.
3. **Is production code healthy?** — Static analysis of source files for observability (logging, error handling) and brevity (function size, cohesion, code accretion).

It maintains a persistent manifest at `.claude/test-verification/manifest.json`. On each run, it detects changed test files (re-verify), changed source files (re-check coverage + re-run static analysis), spawns verification agents, scores against a quality rubric, maps coverage gaps, runs objective static analysis on test and source files, and generates an HTML dashboard with three tabs.

## Cycle State & Context Discipline

### Persistent Cycle Progress (in manifest.json)

This skill may run in a loop (verify → fix → verify → …). To prevent compaction-induced amnesia and repeated work, cycle state lives in `manifest.json` under the `cycle` key:

```json
{
  "cycle": {
    "phase": "verify" | "fix" | "commit" | "done",
    "cycle_number": 1,
    "last_file_processed": null,
    "files_verified_this_cycle": [],
    "files_fixed_this_cycle": [],
    "hook_instruction_hash": "sha256...",
    "started_at": "ISO timestamp",
    "last_updated": "ISO timestamp"
  }
}
```

**No separate file to forget.** Manifest is written after every verification (Step 4) and every fix (test-fixer Step 4). Cycle state is updated as a side effect of operations that already happen. There is no extra "remember to update cycle state" step — it's part of the same `manifest.json` write you're already doing.

**First action every turn**: Read `manifest.json`, check `cycle.phase` and `cycle.last_file_processed`. You know exactly where you are even after compaction wipes context.

**Never re-create "Cycle 1"**. If `manifest.cycle.cycle_number: 3`, create "Cycle 4" tasks. If you find yourself about to create "Cycle 1" again, STOP — manifest.cycle tells you where you are.

**Update cycle fields inline** — set `cycle.last_file_processed` when you finish a file, bump `cycle.cycle_number` at cycle boundaries, toggle `cycle.phase` when switching between verify/fix/commit. All go into the same manifest write you're already doing.

### Context Compaction Resilience

Context gets compacted — you WILL forget past messages. That's fine. Manifest.cycle is your durable memory:

1. **Every turn, first action**: Read manifest.json. `cycle.phase` + `cycle.last_file_processed` tells you exactly where you are.
2. **Compaction happens** → you re-read manifest.json → you continue from where you left off.
3. **If you can't find your place**: manifest.cycle IS your place. The `files_verified_this_cycle` list shows what's done; everything else is pending.

**Key insight**: Compaction doesn't matter if state is in the same file you already write. Manifest.json gets saved after every verification anyway — cycle state just adds a few fields to the same write.

### Hook Cooperation

This skill may be invoked via hook injection (repeated `lastPrompt`). On each cycle start:
1. Hash the current instruction text: `echo "$INSTRUCTION" | sha256sum`
2. Compare against `manifest.cycle.hook_instruction_hash`
3. If match → you already have this instruction in context; don't re-parse it as a new command. Continue from where you left off.
4. If no match → new instruction; update hash and re-evaluate scope.

### Task List Discipline

- **Create tasks once** per cycle, never delete and re-create.
- Update task status (pending → in_progress → completed), never the subject.
- If you find yourself about to `TaskCreate` with "Cycle 1" when manifest.cycle.cycle_number is 3, that's a bug. Read manifest.json.

---

## When This Triggers

Any time the user asks about the quality, effectiveness, or health of their tests. Examples:
- "verify my tests" / "check test quality" / "audit the test suite"
- "are these tests good?" / "how effective are my tests?"
- "score my tests" / "rate the test suite"
- "find weak tests" / "which tests need improvement?"
- "test health check" / "test verification"
- "what's not tested" / "coverage gaps" / "untested code" / "missing tests"
- "find code without tests" / "which files have no tests"

Also trigger when the user mentions mutation testing concerns, flaky tests, test maintainability, or test coverage gaps without explicitly naming a different tool.

## Workflow

### Step 1: Discovery

Find all test files in the project. Use these patterns (language-agnostic):

| Pattern | Examples |
|---------|---------|
| `**/*.test.*` | `auth.test.ts`, `utils.test.jsx` |
| `**/*_test.*` | `user_test.rs`, `db_test.py` |
| `**/*.spec.*` | `login.spec.ts`, `api.spec.js` |
| `**/*_spec.*` | `model_spec.rb` |
| `**/test_*.*` | `test_auth.py`, `test_utils.go` |
| `**/spec_*.*` | `spec_parser.rb` |
| `**/__tests__/**/*` | `__tests__/auth.js` |
| `**/tests/**/*` | `tests/test_api.py` (exclude non-test in tests/) |

For `tests/` directories, only include files whose name starts with `test_` or `tests_` or ends with `_test` or `_tests`.

Skip: `node_modules/`, `vendor/`, `.git/`, `dist/`, `build/`, `target/`, `__pycache__/`, `*.pb.go`, generated files.

### Step 1b: Source File Discovery

Find all production source files. These are files that SHOULD have tests. Use language-typical source directories and extensions:

| Language | Source dirs | Extensions |
|----------|-------------|------------|
| TypeScript/JS | `src/`, `lib/`, `app/` (excluding `__tests__/`) | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` |
| Python | `src/`, `lib/`, `<package_name>/` | `.py` |
| Rust | `src/` (excluding `tests/`) | `.rs` |
| Go | project root, `cmd/`, `pkg/`, `internal/` | `.go` |
| Ruby | `lib/`, `app/` | `.rb` |
| Java/Kotlin | `src/main/` | `.java`, `.kt`, `.kts` |
| C# | project root, subdirs | `.cs` |
| C/C++ | `src/`, `lib/`, `include/` | `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp` |

**Exclude from source files:**
- Test files (already discovered in Step 1)
- Type definition files (`.d.ts`) unless they contain runtime code
- Config files, build scripts, migration files (unless they contain business logic)
- Generated code (`*.pb.go`, `*.g.cs`, `__generated__/`, etc.)
- Scripts in `scripts/`, `bin/`, `tools/` (include them — they ship to production, they need coverage)

**Heuristic**: If a directory has test files but no obvious source dir, look for a parallel non-test directory (e.g., `tests/test_auth.py` → look for `src/auth.py` or `lib/auth.py` or root `auth.py`).

### Step 1c: Coverage Mapping

For each source file, check if there's a matching test file. Use these heuristics in order:

**1. Naming convention matching** (language-agnostic):

Given source file `src/auth/login.ts`:
| Test pattern | Match example |
|---|---|
| `<dir>/__tests__/<name>.test.<ext>` | `src/auth/__tests__/login.test.ts` |
| `<dir>/<name>.test.<ext>` | `src/auth/login.test.ts` |
| `__tests__/<name>.test.<ext>` | `__tests__/login.test.ts` |
| `tests/<name>_test.<ext>` | `tests/login_test.ts` |
| `tests/test_<name>.<ext>` | `tests/test_login.py` |
| `spec/<name>_spec.<ext>` | `spec/login_spec.rb` |
| `<name>_test.<ext>` (same dir) | `src/auth/login_test.go` |
| `test_<name>.<ext>` (same dir) | `src/auth/test_login.py` |

Where `<name>` = source filename without extension, `<dir>` = source file's directory, `<ext>` = matching test extension for language.

**2. Import/require analysis** (required — run for every source file):

Search test files for imports/requires of the source module:
- TypeScript/JS: `import ... from './login'` or `require('./login')`
- Python: `from auth.login import` or `import auth.login`
- Rust: `use crate::auth::login` or `mod login`
- Go: `import ".../auth"` (package-level, less precise)
- Ruby: `require 'auth/login'`

If a test file imports from a source file, they're definitively linked.

**3. Directory mirroring** (fallback):

If project mirrors structure (e.g., `src/X/Y.ts` and `tests/X/test_Y.ts`), detect the mirror pattern and apply it.

**Result categories:**
- **Covered**: At least one matching test file found with high confidence
- **Possibly covered**: Weak match (same package name, similar naming, but not definitive)
- **Untested**: No matching test file found by any heuristic

### Step 1c-2: Line/Branch Coverage Measurement

Where the project's toolchain supports coverage instrumentation, measure actual line and branch coverage. This complements the binary "has a test file" mapping with quantitative data.

**Coverage tooling by language:**

| Language | Coverage tool | Command | Output format |
|----------|--------------|---------|---------------|
| Rust | tarpaulin (recommended) or cargo-llvm-cov | `cargo tarpaulin --out Json` or `cargo llvm-cov --json` | JSON with per-file line/branch % |
| C# | coverlet + reportgenerator | `dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=json` | JSON with per-file/line/branch % |
| Go | built-in | `go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out` | Text table with per-function % |
| JS/TS | c8 / nyc / v8 | `npx c8 --reporter=json npm test` or `npx vitest run --coverage` | JSON with per-file line/branch % |
| Python | coverage.py / pytest-cov | `pytest --cov=src --cov-report=json` | JSON with per-file line/branch % |

**Installation (if tooling missing):**

| Language | Install command |
|----------|----------------|
| Rust | `cargo install cargo-tarpaulin` (or `cargo install cargo-llvm-cov` for llvm-cov) |
| C# | `dotnet add package coverlet.collector` (project already needs coverlet NuGet — add if absent) |
| Go | Built into Go toolchain — no install needed |
| JS/TS | `npm install --save-dev c8` (or `npm install --save-dev @vitest/coverage-v8`) |
| Python | `pip install coverage pytest-cov` |

**Coverage is required, not optional.** If the tool isn't installed, install it and run it. If the tool fails, diagnose and fix the failure. Skipping coverage because "tools aren't available" is not acceptable — the tools are always installable. The only valid reason for missing coverage data is if every installation method fails after documented troubleshooting.

**Measurement procedure:**

1. If the project already has coverage configured (check for `coverage/` dir, `.coveragerc`, `coverlet.runsettings`, `tarpaulin.toml`), use the existing config.
2. If no coverage config exists, add the minimal config needed for JSON output (use language defaults above). Do NOT commit coverage config — it's temporary for this measurement.
3. **If coverage tooling is not installed, install it.** Coverage measurement is required, not optional. Install the appropriate tool for the language:
3. Run the coverage command. Parse output:
   - Extract `line_coverage_pct` and `branch_coverage_pct` per source file
   - Files with no coverage data: mark as `line_coverage: null, branch_coverage: null`
4. Store in manifest under each source file's coverage entry:

```json
{
  "path": "src/auth/login.ts",
  "lines": 85,
  "test_match": "covered",
  "matching_test": "src/auth/__tests__/login.test.ts",
  "risk": "low",
  "line_coverage_pct": 87.3,
  "branch_coverage_pct": 72.1
}
```

**Risk adjustment**: When line/branch coverage data is available, adjust risk levels:
- Binary "covered" but line coverage < 50% → escalate risk (low→medium, medium→high)
- Binary "covered" with branch coverage < 30% → flag as "tested but branch-weak"
- Binary "untested" confirmed by 0% coverage → keep original risk
- Coverage data unavailable → keep binary-based risk level

**Coverage-only mode**: When invoked with "coverage-only", run coverage measurement. When invoked normally, coverage measurement is part of the standard run — always run it. Large projects (>500 files) may batch it but must complete it before the run is considered done.

**Edge cases:**
- One test file covering multiple source files (e.g., integration test) → all source files marked covered
- One source file covered by multiple test files (e.g., unit + integration) → count as covered
- Source file that IS a test helper/fixture → skip (it's test infrastructure, not production code)
- Entry point files (`main.go`, `index.ts`, `app.py`) → may legitimately lack unit tests (covered by E2E); flag as "possibly untested" rather than "definitely untested"

Store coverage mapping in manifest (see Step 4).

### Step 1d: Source File Static Analysis

**This is a first-class verification pass, not supplementary.** Production source files are verified to the same standard as test files. Every source file discovered in Step 1b gets analyzed. This runs in parallel with test verification — never deferred until test work is "done."

For every source file, run two objective static analyses (regex-based, same patterns as dod-guard's `observability.ts` and `brevity.ts`):

**Observability scan** — for each source file:
- Count log statements (console.log, logger.error, log::info!, etc. — patterns per language)
- Find error handlers (catch blocks, except clauses, Err(_) =>) and check if they log
- Detect anti-patterns: empty catch blocks (`catch (e) { }`, `except: pass`), swallowed errors (catch+return with no log), bare static log messages (no variable interpolation)
- Score: start at 10, subtract per violation, floor at 1 (see rubric)

**Brevity scan** — for each source file:
- Check max line length (>120 chars)
- Detect functions and check length (>30 lines)
- Check file length (>300 lines)
- Check cyclomatic complexity (CC > 5 per function — counts if/for/while/case/catch/&&/||/??/ternary)
- Check unnecessary else (else after return/throw/break/continue — prefer guard clauses)
- Check avoidable else (if/else pairs in functions with zero guard clauses — always flagged, fix strongly recommended)
- Parse git diff --numstat for replacement ratio (deletions/insertions for files with net >10 added lines; ratio < 0.2 = code accretion)
- Score: start at 10, subtract per violation, floor at 1 (see rubric)

Store results in manifest under `source_quality` key.

Implementation: Read each source file, split into lines, apply language-specific regex patterns. See dod-guard's `assertions.ts`, `observability.ts`, and `brevity.ts` for the exact regex patterns per language (JS/TS, Python, Rust, C#).

### Step 1e: Objective Static Analysis (test and source files)

For EVERY test file, run objective static analysis AFTER LLM classification — regex extracts mechanical counts the LLM might miss or miscount (assertion totals, trivial patterns, message counts, sleep counts, I/O counts). Regex is SUPPLEMENTAL — it corrects mechanical errors, never replaces LLM judgment.

**Order is critical**: LLM classification runs FIRST (primary data). Regex runs SECOND (mechanical correction). Never reverse this — regex-before-LLM produces the postmortem failure: agents skip LLM because scores "look plausible" from regex alone.

**Implementation**: Use `test-metrics.ts` patterns (per-language regex tables). Extract:
- Test function names and count (mechanical — LLM may miscount from snippets)
- Assertion counts: total, trivial, truthiness, specific, messaged/unmessaged (verify against LLM counts)
- Determinism flags: real time, random, sleep, filesystem, network, database, shared mutable state (LLM resolves context — is it mocked?)
- Isolation: setup/teardown presence, module-level mutable vars, test.only/skip (LLM verifies effectiveness)
- Clarity: generic test names, AAA markers, magic numbers in assertions (LLM reclassifies magic numbers)
- Speed: sleep/wait count, real I/O count (mechanical — LLM doesn't need to count these)
- Coverage depth hints: error-path test indicators (LLM reads bodies and classifies)
- Diagnostics: assertions with/without messages, framework diff capability (mechanical)
- Assertion triviality: constant-on-constant patterns (mechanical — no LLM judgment needed)

Store raw metrics alongside LLM classifications in manifest under `metrics` key. Metrics that conflict with LLM classifications are overwritten by LLM values (LLM wins where context-dependent).

**Language support**: JS/TS, Python, Rust, C#, Go — per-language regex tables covering all patterns above.

### Step 2: Manifest & Change Detection

**First run** (no manifest exists): Create `.claude/test-verification/` directory, build a fresh manifest with all discovered test files.

**Subsequent runs**: Read the existing manifest, compute SHA-256 hash of each discovered test file, compare against stored hashes. Three categories:
- **New**: file not in manifest → verify
- **Changed**: hash differs from stored → verify
- **Unchanged**: skip (unless `--force` / "verify all" requested)

**Force mode**: User says "verify all tests", "full audit", "re-verify everything", or passes `--force` → ignore hashes, verify every file.

Report to user: "X test files found. Y changed, Z new, W unchanged. Starting verification of Y+Z files..."

#### SHA-256 IS the Dirty Marker — NOTHING ELSE

The manifest's stored SHA-256 hashes are the **sole source of truth** for whether a file needs verification. **Never** use these for dirty detection:
- ❌ `git status` — shows working tree vs HEAD, not verification state
- ❌ `git diff` — shows uncommitted changes, not whether verification has run
- ❌ File modification timestamps (mtime) — unreliable across OS/fs operations
- ❌ "I think I already verified this" — state in your context may be stale

**Only pattern**: Read file → compute SHA-256 → compare to manifest hash → different → verify. That's it.

If manifest says hash `abc123` and file hashes to `abc123`, the file has been verified. Skip it. Even if git says the file was "just touched." Even if you "remember" changing it. Trust the hash.

### Step 3: Per-File LLM Classification (PRIMARY — runs first, IS the verification)

**This is the core verification step. Regex static analysis (Step 1e) supplements this — it does NOT replace it.**

For each changed/new test file, spawn a classification subagent. Process files **sequentially** (one at a time). Each file gets its own independent subagent — no batching, no inlining. This is the cost of actual verification.

**Anti-skip gate**: Before proceeding to scoring, verify that EVERY file in scope has a non-empty `classifications` entry. If any file has `classifications: {}` (no subagent spawned for it), scoring MUST NOT proceed. Report the gap and spawn the missing subagents.

**Subagents do NOT compute scores.** They classify patterns, verify context, and return structured counts. The scoring formula runs separately after all classifications are collected and merged with regex metrics.

Each subagent receives:
- The full test file content (read the complete file, not a snippet)
- The project's test framework context (inferred from imports/config)
- The classification checklist from `references/scoring-rubric.md`
- Pre-extracted regex hints (supplied for efficiency — verify and correct where they're wrong)

**Subagent prompt template:**

```
You are a test quality CLASSIFIER. Read the entire test file and answer specific classification questions. Your output IS the verification — scores are computed from your answers by a deterministic formula. No other step verifies this file.

FILE: <path>
LANGUAGE: <detected>
TEST FRAMEWORK: <detected>

READ THE FULL FILE. Then answer every question in this checklist:

1. ASSERTION CLASSIFICATION:
   - Review each assertion line flagged as "truthiness." Is it truly just a truthiness check (exists/not-null/boolean), or does it assert a specific value?
   - Update: truthiness_assertions (corrected count), specific_assertions (corrected count)

2. DETERMINISM CONTEXT:
   For each flagged item, check if it's mocked:
   - real_time_mocked: is Date.now()/DateTime.Now inside jest.useFakeTimers()/vi.useFakeTimers()/mocker.patch() setup?
   - random_mocked: is Math.random() mocked or seeded?
   - filesystem_mocked: is it using a temp dir (tmpdir/mkdtemp) — NOT a real path?
   - network_mocked: is fetch/HttpClient inside a mock setup or nock/msw/httpmock?
   - database_mocked: is DB connection inside a mock or using in-memory SQLite?
   Answer each as boolean.

3. ISOLATION:
   - creates_own_fixtures: does each test function create its own data, or do tests share module-level fixtures?
   - Are setup/teardown blocks actually resetting state? (If empty or just logging, answer: has_effective_setup = false)

4. CLARITY:
   - For each "magic number" in assertions: is it a well-known constant (HTTP status, answer-to-life 42) or should it be a named constant?
   - multi_behavior_count: count test functions with >3 assertions on unrelated properties/different behaviors

5. COVERAGE DEPTH:
   - Classify each test function as: happy_path (normal/valid inputs only), error_path (expects error/exception/rejection), or edge_case (null/empty/zero/boundary/max/min inputs)
   - Provide counts: happy_path_functions, error_path_functions, edge_case_functions
   - A test function CAN be both error_path AND edge_case if it tests an error with a boundary value — in that case, count it once under error_path (error coverage is more informative)

6. DIAGNOSTICS:
   - has_custom_matchers: does this file define custom assertion helpers or matchers?

7. ASSERTIONLESS FUNCTIONS:
   - Verify the zero_assertion_functions count — are there test functions with TRULY zero assertions (not even indirect via helper)?

## OUTPUT

Return ONLY this JSON:
{
  "file": "<path>",
  "classifications": {
    "truthiness_assertions": <number>,
    "specific_assertions": <number>,
    "real_time_mocked": <boolean>,
    "random_mocked": <boolean>,
    "filesystem_mocked": <boolean>,
    "network_mocked": <boolean>,
    "database_mocked": <boolean>,
    "has_effective_setup": <boolean — null if no setup block exists>,
    "creates_own_fixtures": <boolean>,
    "magic_numbers": [{"line": <N>, "value": <N>, "classification": "well_known" | "should_be_named"}],
    "multi_behavior_count": <number>,
    "happy_path_functions": <number>,
    "error_path_functions": <number>,
    "edge_case_functions": <number>,
    "has_custom_matchers": <boolean>,
    "zero_assertion_functions": <number>
  },
  "findings": [
    {"severity": "high|medium|low", "category": "<dimension>", "location": "line N or fn name", "detail": "What's wrong — cite specific metric", "suggestion": "How to fix"}
  ],
  "summary": "<one sentence>"
}

## FINDING SEVERITY RULES (formula-driven):
- Score 1-3 for that dimension → high severity finding
- Score 4-5 → medium severity
- Score 6-7 → low severity
- Score ≥8 → no finding needed
- Max 3 findings per dimension
- Every finding MUST cite the specific metric causing the poor score (e.g., "truthiness_assertions: 8 of 10 use toBeDefined()")
```
```

### ⛔ Classification Completeness Gate

**Before any file moves to Step 4 scoring, this gate MUST pass:**

For every file in the current verification scope:
1. A classification subagent has been spawned AND returned a result
2. The returned `classifications` object is non-empty (has at least 5 keys populated)
3. The `file` field in the response matches the file path being verified

**If any file fails this gate:**
- STOP. Do NOT compute scores. Do NOT write the manifest.
- Report: "Classification incomplete: <N> of <M> files lack LLM classifications. Files: <list>. Respawning subagents for missing files."
- Respawn the missing subagents.
- After they return, re-check the gate.

**Detection**: Before batch-writing manifest entries, scan all `classifications` objects. Reject any where `Object.keys(classifications).length < 5` or `classifications` is `{}` or missing.

**Why this gate**: The postmortem failure was writing a manifest with empty `classifications: {}` for every file, then treating the unverified regex data as final scores. This gate makes that impossible — the pipeline halts before scoring if classifications are missing.

### ⛔ Source Quality Completeness Gate

**Before the verification run is considered complete, this gate MUST pass:**

For every source file discovered in Step 1b:
1. An observability scan has been run AND produced a score
2. A brevity scan has been run AND produced a score
3. The `source_quality` key in manifest is non-empty

**If any source file fails this gate:**
- STOP. The verification run is INCOMPLETE.
- Report: "Source analysis incomplete: <N> of <M> source files lack observability/brevity scores. Running analysis..."
- Run the missing analyses.
- After they complete, re-check the gate.

**Detection**: Before writing the manifest, verify `Object.keys(manifest.source_quality).length > 0`. If empty or missing, the source analysis pass was skipped. This is a blocking condition. A dashboard with no source quality tab data is invalid.

**Why this gate**: The second postmortem failure was spending the entire session on test file scoring while never analyzing production source code. Production files need observability/brevity scores too — they're a parallel first-class requirement, not an afterthought to defer until test work is "done enough."

### Step 4: Compute Scores + Update Manifest (IMMEDIATE — same turn)

**Pre-conditions**: Classification completeness gate passed for this file. Source quality completeness gate passed for ALL source files.

After both gates pass, compute scores via formula:

1. Merge subagent classifications with regex metrics (LLM classifications take priority where both exist). Regex fills mechanical gaps only.
2. Run Step 1e regex extraction on the file (mechanical counts: assertion totals, trivial patterns, message counts, sleep/I/O counts)
3. Apply scoring formulas from `references/scoring-rubric.md` using merged data
4. Compute SHA-256 of verified file
5. Write manifest.json with metrics, classifications, scores, hash, and timestamp

**Why same-turn:** If compaction hits between verify and manifest-write, the old hash persists and you re-verify. Write the hash while you still have the classification and scores in context.

Manifest structure:
```json
{
  "project_root": "/absolute/path/to/project",
  "cycle": {
    "phase": "verify",
    "cycle_number": 2,
    "last_file_processed": "src/checker.test.ts",
    "files_verified_this_cycle": ["src/author.test.ts", "src/checker.test.ts"],
    "files_fixed_this_cycle": [],
    "hook_instruction_hash": "abc123...",
    "started_at": "2026-07-06T20:00:00Z",
    "last_updated": "2026-07-06T20:05:00Z"
  },
  "last_full_run": "2026-07-06T20:00:00Z",
  "last_partial_run": "2026-07-06T20:15:00Z",
  "files": {
    "src/__tests__/auth.test.ts": {
      "hash": "abc123...",
      "last_verified": "2026-07-06T20:00:00Z",
      "scores": { ... },
      "overall": 7.1,
      "metrics": {
        "test_function_count": 12,
        "total_assertions": 23,
        "trivial_assertions": 2,
        "truthiness_assertions": 3,
        "specific_assertions": 18,
        "zero_assertion_functions": 0,
        "assertions_with_message": 8,
        "assertions_without_message": 15,
        "has_real_time": false,
        "has_unseeded_random": false,
        "has_sleep": false,
        "has_real_filesystem": false,
        "has_real_network": false,
        "has_real_database": false,
        "has_shared_mutable_state": false,
        "has_setup_teardown": true,
        "module_mutable_count": 0,
        "has_test_only": false,
        "creates_own_fixtures": true,
        "generic_names": [],
        "has_aaa_markers": true,
        "magic_number_count": 1,
        "multi_behavior_count": 0,
        "error_path_functions": 3,
        "happy_path_functions": 7,
        "edge_case_functions": 2,
        "sleep_wait_count": 0,
        "real_io_count": 0,
        "framework_shows_diff": true,
        "has_custom_matchers": false
      },
      "classifications": { ... },
      "findings": [ ... ]
    }
  },
  "coverage": {
    "total_source_files": 45,
    "tested": 32,
    "possibly_tested": 5,
    "untested": 8,
    "line_coverage_available": true,
    "overall_line_pct": 71.3,
    "overall_branch_pct": 58.7,
    "untested_files": [
      {
        "path": "src/utils/retry.ts",
        "lines": 42,
        "reason": "No matching test file found by naming or import analysis",
        "risk": "medium",
        "line_coverage_pct": 0,
        "branch_coverage_pct": 0
      }
    ],
    "weakly_covered": [
      {
        "path": "src/auth/handler.ts",
        "lines": 120,
        "test_match": "covered",
        "matching_test": "src/auth/__tests__/handler.test.ts",
        "risk": "medium",
        "line_coverage_pct": 42.5,
        "branch_coverage_pct": 18.2,
        "issue": "Has tests but low line/branch coverage"
      }
    ],
    "entry_points_untested": [
      {
        "path": "src/main.ts",
        "lines": 15,
        "reason": "Entry point — typically covered by E2E, no unit test found",
        "risk": "low"
      }
    ]
  },
  "source_quality": {
    "src/auth/login.ts": {
      "hash": "def456...",
      "last_analyzed": "2026-07-06T20:00:00Z",
      "lines": 85,
      "functions": 4,
      "observability": {
        "score": 8,
        "log_statements": 5,
        "error_handlers": 2,
        "error_handlers_logged": 2,
        "anti_patterns": []
      },
      "brevity": {
        "score": 7,
        "long_lines": 3,
        "long_functions": 1,
        "file_too_long": false,
        "high_complexity_functions": 0,
        "unnecessary_else_count": 0,
        "else_avoidable_count": 0,
        "replacement_ratio": null
      }
    }
  }
}
```

Coverage risk levels:
- **high**: Core business logic with no test coverage (>50 lines of logic, no matching test)
- **medium**: Utility/library code with no test coverage (20-50 lines)
- **low**: Entry points, thin wrappers, config files, or files <20 lines

### Step 5: Generate Dashboard

After all verifications complete, generate an HTML dashboard at `.claude/test-verification/dashboard.html`.

Use the template from `assets/dashboard.html`. Replace `__MANIFEST_DATA__` with the JSON-serialized manifest data, and `__GENERATED_AT__` with the current ISO timestamp.

The dashboard has three tabs:
- **Test Quality** — Project summary stats (total files, average overall score, score distribution), table of all files with 8 dimension scores sortable by column, color-coding (green ≥8, yellow 5-7, red <5), expandable rows showing findings per file, trivial assertion counts, filter by score threshold
- **Coverage Gaps** — Coverage percentage gauge, list of untested source files sorted by risk, line counts, match confidence details, and links to the untested files
- **Source Quality** — Table of all source files with observability and brevity scores, expandable rows showing anti-patterns (empty catches, swallowed errors, bare logs), function size and cohesion violations, code accretion warnings

### Step 6: Report Summary

Output a terminal summary after completion:

```
## Test Verification Complete

### Test Quality
Files verified: N (X new, Y changed, Z skipped)
Average score: 7.2/10

### Top Issues Found
1. [category] N files: brief description
2. ...

### Trivial Assertions Detected
- path/to/test.ts: 3 trivial out of 12 total assertions (score: 7)
- ...

### Lowest Scoring Files
- path/to/test.ts (4.2) — truthiness_assertions: 8/10, error_path_functions: 0/12, assertions_without_message: 15/15
- ...

### Source Code Quality
Source files analyzed: 45

#### Observability Issues
- src/api/handler.ts: 2 empty catch blocks, 1 error handler without logging (score: 5)
- ...

#### Brevity Issues
- src/utils/parser.ts: 1 function >30 lines, CC=7, 1 unnecessary else (score: 6)
- ...

### Coverage Gaps
Source files total: 45 · Tested: 32 · Possibly tested: 5 · Untested: 8 (file coverage: 71%)
Line coverage: 71.3% · Branch coverage: 58.7%

#### Weakly Covered (has tests but low coverage)
- src/auth/handler.ts (120 lines, 42.5% line, 18.2% branch) — Tests exist but cover <50% of code

#### High Risk (untested business logic)
- src/utils/retry.ts (42 lines) — No matching test file found
- src/auth/token.ts (67 lines) — No matching test file found

#### Medium Risk
- src/helpers/format.ts (35 lines) — No matching test file found

#### Entry Points (low risk, likely covered by E2E)
- src/main.ts (15 lines) — Entry point, no unit test

Dashboard: .claude/test-verification/dashboard.html
```

## Mode: Single File

User can target a single file: "verify tests/auth.test.ts" → skip discovery, just verify that one file. Update its manifest entry, regenerate dashboard.

## Mode: Coverage Only

User asks "what's not tested", "find coverage gaps", "show untested code" → skip test quality scoring entirely. Run only Steps 1a-1c (discover test files + source files + map coverage). Populate the coverage section of the manifest and generate dashboard with only the gaps tab. No agents needed — this is a fast path.

Coverage-only also triggered implicitly on every full run (Steps 1-6). It always runs even if no test files changed, because new source files may have been added.

## Mode: Diff-Aware

User can ask "verify tests for my changes" → use `git diff --name-only HEAD~1` to find changed source files, then verify only test files that exercise those changed sources (or all test files if mapping is unclear).

## Agent Selection

Use the most capable agent available for verification. Each verification agent should be a fresh subagent. Do NOT inline verification in the main thread — each file gets its own independent agent to avoid bias and context pollution.

## Hard Rules (Anti-Patterns)

These patterns caused 5× token waste in production. Violating any of them = the loop breaks.

| Rule | Rationale |
|------|-----------|
| **Never use `git status` for dirty detection** | Manifest SHA-256 IS the dirty marker. Git status tells you nothing about verification state. |
| **Never read a file you already read this cycle** | If you read `auth.test.ts` on turn 3, don't re-read it on turn 7 for the same cycle. It's been edited? The manifest hash will tell you. |
| **Never run full test suite more than once per cycle** | Single-file test per iteration. Full suite: only at cycle boundary (before commit). Use project's test runner. |
| **Never delete and re-create tasks** | Create once, update status. If you find yourself re-creating "Cycle 1", read manifest.cycle instead. |
| **Never skip manifest.cycle on startup** | First action every turn: read manifest.json, check cycle.phase and cycle.last_file_processed. Even if you think you remember where you are. Compaction means you don't. |
| **Never trust your memory of what was verified** | Only the manifest hashes matter. If your context says "I verified X" but the hash differs, re-verify. Context memory is not durable across turns. |
| **A verify is NOT complete until manifest hash is written** | Scoring a file without writing the hash is wasted work. Hash recovery saves you on next run, but every re-verify of an already-verified file is wasted tokens. Write the hash in the same turn as the verification. |
| **Never skip per-file LLM classification** | Regex static analysis (Step 1e) is SUPPLEMENTAL — it corrects mechanical errors. LLM classification (Step 3) is PRIMARY — it IS the verification. A manifest written without LLM classifications is invalid. |
| **Never write manifest with empty classifications** | Before writing any file's manifest entry, verify `Object.keys(classifications).length >= 5`. Empty `classifications: {}` means no subagent ran for that file. The completeness gate blocks scoring until all files have valid classifications. |
| **Regex static analysis runs AFTER LLM classification, never before** | Running regex first lets the agent see "plausible scores" and skip LLM work. LLM classification always runs first — regex is a mechanical correction pass afterward. |

## Bundled Resources

- `references/scoring-rubric.md` — Objective scoring formulas + LLM classification checklist. Read this before spawning classification agents so you can include key points in the agent prompt.
- `assets/dashboard.html` — HTML template for the dashboard. Replace placeholders with actual data.
