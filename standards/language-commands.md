# Language Command Reference

Concrete proof commands per language for each mandatory proof category.
During Phase 1 research, detect the project language and use this table to construct proofs.

## Detection Heuristics

| Signal | Language |
|--------|----------|
| `*.csproj`, `*.sln`, `global.json` | C# (.NET) |
| `Cargo.toml` | Rust |
| `pyproject.toml`, `setup.py`, `requirements.txt` | Python |
| `package.json` (no `Cargo.toml`) | TypeScript/JavaScript |
| `go.mod` | Go |

---

## Delta-Based Lint & Format Proofs

Most projects carry pre-existing tech debt. **Never use full-project zero-tolerance proofs**
unless Phase 1 research confirms the project is already clean.

### Strategy

1. **Phase 1**: Run the linter/formatter on the full project. Count existing violations.
2. **If mostly clean (<10 violations)**: Proactively fix the remaining issues and use zero-tolerance greenfield proofs. Small cleanup is worth it to get the project fully clean.
3. **If dirty (10+ existing violations)**: Use delta commands — don't take on existing debt.

### Delta Techniques

| Technique | How | When |
|-----------|-----|------|
| **Lint: scope to changed files** | `git diff --name-only HEAD~1 -- '*.ext'` piped to linter | Default for lint in brownfield projects |
| **Lint: baseline count** | Count warnings before vs after, assert `<=` | When scoping by file is impractical |
| **Lint: scope to directory** | Lint only `src/NewModule/` | New components in existing projects |
| **Format: before/after count** | Dry-run formatter before and after changes, assert violation count stays same or decreases | Default for format in brownfield (10+) projects |
| **Format: proactive fix** | Fix remaining violations, then use zero-tolerance | When <10 format violations — low effort, high payoff |

### Format Proof Pattern (before/after dry-run)

For brownfield projects (10+ violations), format proofs **only measure, never apply changes**:

1. **During Phase 1** (before any code changes): run formatter in dry-run/check mode, count violations. Record this number as `FORMAT_BASELINE` in `research_notes`.
2. **In the DoD proof**: run the same dry-run command, count violations, assert `<= FORMAT_BASELINE`.

This ensures:
- No formatting noise in PRs
- Pre-existing format debt is not the developer's problem
- New code doesn't make formatting *worse*
- Formatting *improvements* are allowed/encouraged but not required

For mostly-clean projects (<10 violations), proactively fix the remaining issues and use zero-tolerance proofs instead. Getting a project to fully clean is worth a small cleanup commit.

---

## C# (.NET)

### Greenfield (clean project)

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Build** | `dotnet build --no-restore` | `exit_code: 0` | |
| **Lint/Quality** | `dotnet build -warnaserror 2>&1` | `output_not_contains: "warning"` | Zero warnings policy |
| **Format** | `dotnet format --verify-no-changes` | `exit_code: 0` | Only when project is already clean |

### Brownfield (existing tech debt) — preferred default

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Build** | `dotnet build --no-restore` | `exit_code: 0` | Build must always succeed |
| **Lint (changed files)** | `dotnet format --include $(git diff --name-only HEAD~1 -- '*.cs') --verify-no-changes` | `exit_code: 0` | Only lint-checks files you touched |
| **Lint (new warnings)** | `dotnet build 2>&1 \| grep -c "warning" \| xargs -I{} test {} -le BASELINE` | `exit_code: 0` | Replace BASELINE with count from Phase 1 |
| **Format (dry-run)** | `dotnet format --verify-no-changes 2>&1 \| grep -c "would be formatted" \| xargs -I{} test {} -le FORMAT_BASELINE` | `exit_code: 0` | Replace FORMAT_BASELINE with count from Phase 1. Never applies changes. |

### Common proofs (both modes)

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Test (full suite)** | `dotnet test --no-build` | `exit_code: 0` | Runs all tests in solution |
| **Test (specific)** | `dotnet test --filter "FullyQualifiedName~TestClassName"` | `exit_code: 0` | Target specific test class |
| **TDD** | `dotnet test --filter "FullyQualifiedName~TestClassName"` | `tdd: 0` | Must fail first |
| **Structure (assertions)** | `grep -rE "(Assert\.\|Should[.()]\|Expect\()" tests/` | `output_matches: "(Assert\\.\|Should[.()])"` | Verify real assertions exist |
| **Structure (test exists)** | `find . -path "*/Tests/*" -name "*Tests.cs"` | `exit_code: 0` | Test file exists |
| **Documentation** | `find . -name "README.md" -path "*/NewComponent/*"` | `exit_code: 0` | Docs for new component |

### C# Assertion Patterns

Common assertion patterns to match in structural proofs:
- **MSTest**: `Assert.AreEqual`, `Assert.IsTrue`, `Assert.ThrowsException`
- **NUnit**: `Assert.That`, `Is.EqualTo`, `Throws.Exception`
- **xUnit**: `Assert.Equal`, `Assert.True`, `Assert.Throws`
- **FluentAssertions**: `.Should().Be()`, `.Should().Throw()`
- **Shouldly**: `.ShouldBe()`, `.ShouldThrow()`

Structural proof regex: `"(Assert\\.|Should[.()]|Expect\\()"`

---

## Rust

### Greenfield (clean project)

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Build** | `cargo build 2>&1` | `output_not_contains: "error"` | |
| **Lint/Quality** | `cargo clippy 2>&1` | `output_not_contains: "warning"` | Zero warnings policy |
| **Format** | `cargo fmt --check` | `exit_code: 0` | Only when project is already clean |

### Brownfield (existing tech debt) — preferred default

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Build** | `cargo build 2>&1` | `output_not_contains: "error"` | Build must always succeed |
| **Lint (changed files)** | `cargo clippy -- -W clippy::all 2>&1 \| grep -cE "^warning" \| xargs -I{} test {} -le BASELINE` | `exit_code: 0` | Replace BASELINE with count from Phase 1 |
| **Lint (scoped to module)** | `cargo clippy -p package_name 2>&1` | `output_not_contains: "warning"` | When new code is in a clean package |
| **Format (dry-run)** | `cargo fmt --check 2>&1 \| grep -c "Diff in" \| xargs -I{} test {} -le FORMAT_BASELINE` | `exit_code: 0` | Replace FORMAT_BASELINE with count from Phase 1. Never applies changes. |

### Common proofs (both modes)

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Test (full suite)** | `cargo test` | `exit_code: 0` | Runs all tests |
| **Test (specific)** | `cargo test -- test_name` | `exit_code: 0` | Target specific test |
| **TDD** | `cargo test -- test_name` | `tdd: 0` | Must fail first |
| **Structure (assertions)** | `grep -rE "assert(_eq\|_ne\|!)?" tests/` | `output_matches: "assert"` | Verify real assertions exist |
| **Structure (test exists)** | `grep -r "#\\[test\\]" src/` | `exit_code: 0` | Test attribute present |
| **Documentation** | `cargo doc --no-deps 2>&1` | `output_not_contains: "warning"` | Scope to new modules if needed |

### Rust Assertion Patterns

Structural proof regex: `"(assert!|assert_eq!|assert_ne!|panic!|should_panic)"`

---

## Python

### Greenfield (clean project)

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Lint/Quality** | `ruff check .` | `exit_code: 0` | Zero violations (or `flake8 .`) |
| **Type check** | `mypy src/` | `exit_code: 0` | Full type checking |
| **Format** | `ruff format --check .` | `exit_code: 0` | Only when project is already clean |

### Brownfield (existing tech debt) — preferred default

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Lint (changed files)** | `ruff check $(git diff --name-only HEAD~1 -- '*.py')` | `exit_code: 0` | Only checks touched files |
| **Type check (scoped)** | `mypy src/new_module/` | `exit_code: 0` | Scope to new/changed module |
| **Format (dry-run)** | `ruff format --check . 2>&1 \| grep -c "would be reformatted" \| xargs -I{} test {} -le FORMAT_BASELINE` | `exit_code: 0` | Replace FORMAT_BASELINE with count from Phase 1. Never applies changes. |
| **Lint (baseline)** | `ruff check . 2>&1 \| grep -c "error" \| xargs -I{} test {} -le BASELINE` | `exit_code: 0` | Replace BASELINE with count from Phase 1 |

### Common proofs (both modes)

| Proof category | Command | Predicate | Notes |
|---------------|---------|-----------|-------|
| **Build** | `python -m py_compile src/module.py` | `exit_code: 0` | Syntax check |
| **Test (full suite)** | `python -m pytest` | `exit_code: 0` | Runs all tests |
| **Test (specific)** | `python -m pytest tests/test_module.py -v` | `exit_code: 0` | Target specific test file |
| **TDD** | `python -m pytest tests/test_module.py -v` | `tdd: 0` | Must fail first |
| **Structure (assertions)** | `grep -rE "assert \|self\\.assert\|pytest\\.raises" tests/` | `output_matches: "assert"` | Verify real assertions exist |
| **Structure (test exists)** | `find . -name "test_*.py" -path "*/tests/*"` | `exit_code: 0` | Test file exists |
| **Documentation** | `find . -name "*.md" -path "*/docs/*"` | `exit_code: 0` | Docs for new component |

### Python Assertion Patterns

Common assertion patterns to match:
- **pytest**: `assert`, `pytest.raises`, `pytest.approx`
- **unittest**: `self.assertEqual`, `self.assertTrue`, `self.assertRaises`

Structural proof regex: `"(assert |self\\.assert|pytest\\.(raises|approx))"`

---

## Mutation Testing (test quality)

A green test suite can still catch **zero** bugs. The `mutation` predicate proves the
tests actually kill mutants: it parses the surviving-mutant count from the tool's output
and passes iff survivors `<= N` (default `0`). It is **optional** (a missing mutation proof
is a soft warning, never a hard block) and is the **strongest test-quality proof** — reserve
it for **critical logic**.

**Scope to changed functions, not the whole codebase.** Full-codebase mutation runs are slow
and dominated by untouched code; the delta/brownfield philosophy applies here too. Each tool
has a built-in changed-set mode:

| Language | Tool | Changed-functions-scoped command | Predicate |
|----------|------|----------------------------------|-----------|
| **Rust** | cargo-mutants | `git diff origin/main > changed.diff && cargo mutants --in-diff changed.diff` | `mutation: 0` |
| **Python** | mutmut | `mutmut run --paths-to-mutate $(git diff --name-only origin/main -- '*.py')` | `mutation: 0` |
| **TypeScript/JavaScript** | Stryker | `npx stryker run --since origin/main` (or `--mutate $(git diff --name-only origin/main -- '*.ts')`) | `mutation: 0` |

Notes:
- **cargo-mutants** reports survivors as `N missed` in its summary line; the parser reads that count.
- **Stryker** survivors come from the `# survived` column of the clear-text reporter table.
- **mutmut** survivors are the 🙁 count in the run progress / `mutmut results` legend.
- **Fail-safe:** if the tool output cannot be parsed, the proof FAILS with an explicit reason — it never passes on output it does not recognise. If a tool's format genuinely cannot be parsed, fall back to an `exit_code` proof and document the exception.
- Raise `N` above `0` only with justification — e.g. a known-equivalent mutant that cannot be killed.

---

## Regression Metrics (performance / complexity / coverage / duplication)

The `regression` predicate proves a numeric quality metric does not regress vs a **captured
baseline** — never an impossible absolute target (see
[dod-baselines.md](dod-baselines.md), *Non-regression over absolutes*). It is two-phase: an early
**capture step** runs the metric command on PRE-change code (stores N0, PASSes), and a later
**compare step** re-runs it and gates N1 against N0 with tolerance `tol`.

- Use `extract` (regex, capture group 1) to pull the metric out of noisy tool output; omit it to
  use the last number in stdout.
- `lower_is_better` defaults to **true** (performance, complexity, duplication). Set it **false**
  for **coverage** (higher is better).
- `regression` proofs default to **advisory** (warn, don't block). Set `advisory: false` for a hard
  SLA gate. Categories: `performance`, `complexity`, `coverage`, `duplication`.

The capture and compare steps run the **same command**; only the ordering (pre- vs post-change) and
the stored baseline differ. Author both steps with identical commands.

| Metric | Language / Tool | Command | extract (capture group 1) | lower_is_better |
|--------|-----------------|---------|---------------------------|-----------------|
| **Performance** | Rust / criterion | `cargo bench -- --output-format bencher` | `test .* \.\.\. bench:\s*([0-9]+)` | true |
| **Performance** | TS/JS / vitest bench | `npx vitest bench --run` | `([0-9.]+)\s*ms` | true |
| **Performance** | Python / pytest-benchmark | `python -m pytest --benchmark-only` | `Mean[^0-9]*([0-9.]+)` | true |
| **Performance** | .NET / BenchmarkDotNet | `dotnet run -c Release --project bench` | `Mean[^0-9]*([0-9.]+)` | true |
| **Complexity** | TS/JS | `npx eslintcc src --format json` (or `npx complexity-report`) | `"average":\s*([0-9.]+)` | true |
| **Complexity** | Python / radon | `radon cc -s -a src` | `Average complexity:\s*\w+\s*\(([0-9.]+)\)` | true |
| **Complexity** | C# / Roslyn metrics | `dotnet build /t:Metrics` then read the report | `CyclomaticComplexity[^0-9]*([0-9]+)` | true |
| **Coverage** | TS/JS / c8/jest | `npx jest --coverage` | `All files[^0-9]*([0-9.]+)` | **false** |
| **Coverage** | Python / coverage.py | `python -m pytest --cov=src` | `TOTAL[^0-9]*([0-9]+)%` | **false** |
| **Coverage** | Rust / tarpaulin | `cargo tarpaulin --print-summary` | `([0-9.]+)%\s*coverage` | **false** |
| **Coverage** | .NET / coverlet | `dotnet test /p:CollectCoverage=true` | `Total[^0-9]*([0-9.]+)%` | **false** |
| **Duplication** | any / jscpd | `npx jscpd src --reporters json --silent` | `"percentage":\s*([0-9.]+)` | true |
| **Duplication** | Python / pylint | `pylint --disable=all --enable=duplicate-code src` | `([0-9.]+)\s*%\s*duplicated` | true |

Notes:
- **Coverage of changed lines** is the strongest coverage signal — prefer a diff-scoped run
  (e.g. `diff-cover`, `jest --changedSince`) so untouched legacy gaps don't dominate the metric.
- **Windows hosts:** capture group regexes are stored in the predicate's `extract` field (engine
  applies them), so the command itself only needs to print the number — no `grep`/`findstr` piping
  required.
- If a tool's output cannot be parsed, the proof FAILs (fail-safe). Adjust `extract`, or fall back
  to an `exit_code` proof and document the exception.

---

## Choosing Commands

When constructing proofs during the interview:

1. **Detect language** in Phase 1 research (check for build files listed in detection heuristics)
2. **Assess project cleanliness** — run linter/formatter once to check for pre-existing violations
3. **Pick greenfield or brownfield** commands based on step 2
4. **Adapt paths** to match the project's actual directory structure (e.g., `tests/` vs `test/` vs `Tests/`)
5. **Combine tools** when needed — the project may use multiple languages (e.g., C# backend + Python scripts)
6. **Record the baseline** — if using baseline count comparison, document the current count in `research_notes` so it can be referenced in proofs
7. **Fall back to generic** if the language isn't listed: `grep` for assertions, language-specific test runner for TDD, any linter configured in the project

---

## Observability (logging and instrumentation)

The `observability` predicate scans changed source files for logging patterns, error handler instrumentation, and anti-patterns. The command should identify which files to scan — typically changed files from git diff, or source files referenced by a test command.

File discovery works two ways:
1. **Command tokens** — source-file-looking arguments in the command string (e.g. `python -m pytest tests/test_foo.py`)
2. **Command output** — stdout lines that look like file paths (e.g. `git diff --name-only` output)

If neither works, the proof fails with "could not identify any source files."

### Recommended commands

| Strategy | Command | Notes |
|----------|---------|-------|
| **Changed files (recommended)** | `git diff --name-only HEAD~1 -- '*.ts' '*.py' '*.rs' '*.cs'` | Scans all changed source files across languages |
| **Per-language changed files** | `git diff --name-only HEAD~1 -- '*.ts' '*.tsx'` | Scoped to one language |
| **Test file references** | `python -m pytest tests/test_module.py` or `npx jest app.test.ts` | Extracts test file paths from the command, scans those |
| **Directory scope** | `npx jest src/new-module/` | Scans all source files referenced by the test run |

### Predicate configuration

| Field | Value | Notes |
|-------|-------|-------|
| `type` | `"observability"` | |
| `value` | minimum log count (default `1`) | Set higher for complex modules |
| `category` | `"observability"` | Soft warning if absent; hard gate when present |

### Example DoD proofs

**JavaScript/TypeScript (changed files):**
```
category: observability
command: git diff --name-only HEAD~1 -- '*.ts' '*.tsx'
predicate: observability: 2
```

**Python (test file references):**
```
category: observability
command: python -m pytest tests/test_auth.py tests/test_handlers.py
predicate: observability: 3
```

**Rust (changed files):**
```
category: observability
command: git diff --name-only HEAD~1 -- '*.rs'
predicate: observability: 1
```

**C# (changed files):**
```
category: observability
command: git diff --name-only HEAD~1 -- '*.cs'
predicate: observability: 2
```

### What gets checked

The engine runs the command, extracts source file paths, then scans each file for:

1. **Log statements** — `console.log/error/warn/info/debug`, `logger.info/error`, `log!()`, `logging.info()`, etc.
2. **Error handlers with logging** — every `catch`/`except`/`Err(_)` must contain a log statement
3. **Anti-patterns flagged:**
   - Empty catch: `catch (e) { }`, `except: pass`
   - Swallowed error: `catch (e) { return null }` without logging
   - Bare static log: `console.error("failed")` without variable context

### What passes vs fails

- **PASS:** sufficient log statements, all error handlers logged, no anti-patterns
- **FAIL:** detailed report showing exactly which files and lines have issues

Unlike `regression`, observability proofs are **not advisory** — if present, they must pass.
