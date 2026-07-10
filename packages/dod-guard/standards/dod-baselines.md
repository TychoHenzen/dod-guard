# Company DoD Baselines

These are company-level Definition of Done standards. Every DoD created via dod-guard
must include **at minimum** the proof categories listed for the applicable work type.

For concrete commands per language, see [language-commands.md](language-commands.md).

---

## Brownfield Reality: Delta-Based Proofs

Most projects carry pre-existing tech debt — thousands of warnings, inconsistent formatting, etc.
Lint and format proofs must account for this. During Phase 1, count existing violations:

- **Mostly clean (<10 violations)**: proactively fix remaining issues and use zero-tolerance proofs. Small cleanup is worth it to get the project fully clean.
- **Dirty (10+ violations)**: use delta proofs — don't take on existing debt:
  - **Lint**: scope to changed files, or assert warning count does not increase
  - **Format**: dry-run only, assert violation count does not increase. Never auto-format — even single-file formatting creates PR noise.
  - **Baseline approach**: capture counts before the change, assert `<=` after

See language-commands.md for per-language delta commands and the <10 threshold logic.

---

## Bug Fix

### Code
- SonarQube/SonarLint issues resolved where possible (reduce tech debt)
- Code meets team dev standards
- Bug fix code refactored where needed
- Code reviewed by another developer; comments discussed

### Testing
- Items tested in multiple scenarios by developer
- If no test existed for this bug, create a regression test to prevent recurrence
- All existing tests pass
- Manually verify the running application — check the fix works and existing features aren't broken

### Other
- All tasks are done
- Bugfix released to correct environment
- Test databases used during development are removed

### Minimum Proof Mapping

| Standard | Proof category | Predicate | Notes |
|----------|---------------|-----------|-------|
| Lint/SonarQube clean | Lint | `output_not_contains` or `exit_code: 0` | Scope to changed files; use delta count if project has existing debt |
| Code standards (format) | Format | `exit_code: 0` | Dry-run before/after: assert violation count stays same or decreases. Never auto-format. |
| Regression test exists | TDD | `tdd: 0` | Test for bug must fail-first, then pass |
| Regression test has real assertions | Structure | `output_matches` | grep for assert on bug-specific condition |
| All existing tests pass | Test | `exit_code: 0` | Full test suite via language test runner |
| **Integration (wiring)** | **Integration** | `output_matches` or `exit_code: 0` | **Mandatory.** Structural grep proving the fix is connected to the system (import in real caller, route registration, config entry). |
| **Integration (behavioral)** | **Integration** | `exit_code: 0` or `output_contains` | **Mandatory.** Exercise the fix through the system's actual entry point (API call, CLI invocation, full page render) — not through test harnesses that bypass real wiring. Last machine-checkable step. |
| Application walkthrough | Manual | `manual` | Manually run the app, verify the fix works and nothing else broke |
| Code review | Manual | `manual` | Reviewed by another developer |
| Released to environment | Manual | `manual` | Deployed to correct environment |
| Test databases removed | Manual | `manual` | Dev/test databases cleaned up |

---

## General (Algemeen)

### Code
- SonarQube/SonarLint issues resolved where possible (reduce tech debt)
- Code meets team dev standards
- Code is clearly understandable: clear names and comments where needed
- Old code touched during work is refactored where needed
- Code reviewed by another developer; comments discussed

### Testing
- Items tested in multiple scenarios by developer
- Verified no new bugs introduced by the change
- Developer has written unit tests for new components; tests pass
- All existing unit tests pass
- Manually verify the running application — check the new functionality works and existing features aren't broken

### Other
- All acceptance criteria completed
- All tasks are done
- New components have documentation so other developers/testers can reference it
- PBI released to correct environment
- Test databases used during development are removed

### Minimum Proof Mapping

| Standard | Proof category | Predicate | Notes |
|----------|---------------|-----------|-------|
| Lint/SonarQube clean | Lint | `output_not_contains` or `exit_code: 0` | Scope to changed files; use delta count if project has existing debt |
| Code standards (format) | Format | `exit_code: 0` | Dry-run before/after: assert violation count stays same or decreases. Never auto-format. |
| New unit tests (TDD) | TDD | `tdd: 0` | Tests for new code must fail-first, then pass |
| New tests have real assertions | Structure | `output_matches` | grep for meaningful assertions |
| All existing tests pass | Test | `exit_code: 0` | Full test suite via language test runner |
| No regressions introduced | Test | `exit_code: 0` | Full test suite still green |
| Documentation exists | Structure | `exit_code: 0` | grep/find for docs on new component |
| **Integration (wiring)** | **Integration** | `output_matches` or `exit_code: 0` | **Mandatory.** Structural grep proving the feature is connected to the system (import in real page/route, router registration, public export). |
| **Integration (behavioral)** | **Integration** | `exit_code: 0` or `output_contains` | **Mandatory.** Exercise the feature through the system's actual entry point — not through mock harnesses or isolated component tests. Last machine-checkable step. |
| Application walkthrough | Manual | `manual` | Manually run the app, verify new functionality works and nothing else broke |
| Code review | Manual | `manual` | Reviewed by another developer |
| Acceptance criteria met | Manual | `manual` | All AC verified |
| Released to environment | Manual | `manual` | Deployed to correct environment |
| Test databases removed | Manual | `manual` | Dev/test databases cleaned up |

---

## Enforcement Rules

1. **Every DoD must declare its type** — bug or general — so the correct baseline applies
2. **Machine-checkable proofs are mandatory** for: lint, tests, TDD, structure, integration. These cannot be replaced with manual proofs.
3. **TDD proofs are required** for:
   - Bug fixes: regression test proving the bug is caught
   - General: unit tests for new functionality
4. **Full test suite proof is always required** — verifies no regressions
5. **Integration proof is always required (two layers)** — a wiring proof (structural grep that the feature is connected to the real system) AND a behavioral proof (exercised through the system's actual entry point, not test harnesses). Both are mandatory. Unit tests and mock-harness tests are not integration. This is the last machine-checkable step before manual proofs.
6. **Manual proofs** are acceptable only for: code review, release verification, database cleanup, acceptance criteria sign-off
7. **Categories are enforced at `dod_create`** — every proof declares a `category`, and the DoD declares a `type` (`bug`/`general`). Creation is **rejected** if `integration_wiring`, `integration_behavioral`, or `test` (full suite) is absent. Missing `tdd`, or a step with only presence/structural proofs, produces a **warning**. This makes the mandate machine-enforced rather than advisory.

## Proof Strength

A proof must verify **correctness**, not mere **presence**. Ranked weakest → strongest:

- **Presence (weak):** `grep`/`findstr` that a name exists. Passes the moment any line contains the string — barely more than compilation. Allowed only as a *supplementary* `structure` or `integration_wiring` check, **never** as a step's sole acceptance.
- **Behavioral (strong):** `test`, `tdd`, `integration_behavioral` — exercise the code and assert on results.

Every step must carry at least one strong proof. A step proven only by presence checks is flagged at creation.

### Mutation testing — the strongest test-quality proof

`test` and `tdd` prove the suite runs and was red-first, but a passing suite can still kill
**zero** bugs. The `mutation` predicate closes that gap: it runs a mutation tool (cargo-mutants /
mutmut / Stryker), parses the surviving (un-killed) mutant count, and passes iff survivors `<= N`
(default `0`). Output it cannot parse FAILs (fail-safe — never auto-passes).

- **Optional, not mandatory.** A DoD with no `mutation` proof gets a soft, non-blocking warning
  (like the `tdd`-absent warning) — it is **never** added to the hard-mandatory categories and
  never blocks `dod_create`.
- **Scope to critical logic / changed functions.** Don't mutate the whole codebase; use each
  tool's changed-set mode (see [language-commands.md](language-commands.md), Mutation Testing).
- **When to add one:** complex branching, money/permission/validation logic, or anywhere "the
  tests are green" is not enough assurance that real defects would be caught.

### Streamline — proving old code was removed

When revising existing functionality, Claude and other LLMs tend to keep old implementations
alongside new ones "for backward compatibility" — creating bloat, complexity, and future
confusion risk where later sessions modify the **old** code path instead of the new one.
The `streamline` predicate closes this gap: it proves **absence**, not presence.

- **Command:** a search for old symbols/patterns (e.g. `rg "oldFunctionName" src/`,
  `grep -rw "deprecated_handler" src/`, `findstr /R "OldClass\b" src\*.py`).
- **Semantics:** PASSES when the search finds nothing (exit 1 — old code fully removed).
  FAILS when matches are found (exit 0 — old code remains). FAILS on tool errors (exit >1 —
  fail-safe, never auto-passes).
- **`value`:** max allowed remaining references (default `0`). Set to N for gradual cleanup
  where N references are acceptable during a transition.
- **Optional, not mandatory.** A DoD with no `streamline` proof gets a soft, non-blocking
  warning (like `mutation`) — it is **never** added to the hard-mandatory categories and
  never blocks `dod_create`.
- **When to add one:** any step that revises or replaces an existing function, module, class,
  or code path. The streamline proof names the old symbols and proves they were removed.

### Observability — proving code is debuggable

Claude-generated code routinely ships without logging, instrumentation, or any way to
diagnose failures in production. The `observability` predicate closes this gap: it scans
changed source files and proves they are instrumented for debugging.

- **Command:** identifies the files to scan — typically `git diff --name-only HEAD~1 -- '*.ts' '*.py'` or a test command that references source files (e.g. `python -m pytest tests/test_module.py`).
- **Semantics:** statically analyzes each source file for:
  1. **Log statements** — `console.*`, `logger.*`, `log!()`, `logging.*`, etc. (per-language).
  2. **Error handlers** — `catch`, `except`, `Err(_)` blocks — with at least one log statement inside.
  3. **Anti-patterns:**
     - Empty catch (`catch { }`, `except: pass`)
     - Swallowed errors (catch block with return/continue but no log or rethrow)
     - Bare static log messages (`console.error("failed")` — no variable interpolation)
- **PASS:** at least `value` log statements found, every error handler is logged, and no anti-patterns detected.
- **FAIL:** insufficient log statements, unlogged error handlers, or anti-patterns — with explicit file:line details.
- **`value`:** minimum log statement count expected (default `1`).
- **Optional, not mandatory.** A DoD with no `observability` proof gets a soft, non-blocking
  warning (like `mutation` and `streamline`) — it is **never** added to the hard-mandatory categories and
  never blocks `dod_create`.
- **When to add one:** any step that changes source code. The observability proof names the changed files and proves they are instrumented.
- **Advisory tier:** observability proofs are NOT advisory — failures fail the step. If you add one, it's expected to pass.
- **File discovery:** The engine extracts file paths from the command tokens (e.g. test file arguments)
  AND from the command's stdout (e.g. `git diff --name-only` output). If no source files are found,
  the proof fails with an explicit reason.

Supported languages: JavaScript/TypeScript, Python, Rust, C#.

**Precision:** presence/removal proofs must match **signatures or word boundaries**, not bare substrings. `findstr "TryStopTracking"` matches both `TryStopTracking(dossierId)` and `TryStopTracking(dossierId, clientId)` — a false positive. Use `grep -w` / `findstr /R` with anchors.

### Non-regression over absolutes — the `regression` predicate

Absolute quality targets ("coverage must be ≥ 90%", "this endpoint must respond in < 50ms")
make **impossible goals** on real brownfield code: the baseline is already below the target, so
the proof can never pass and the DoD is dead on arrival. The same delta philosophy that governs
lint and format applies to every numeric quality metric: **prove the change does not regress vs a
captured baseline, never that it meets an absolute.**

The `regression` predicate encodes this. It is **two-phase**, keyed by whether a baseline has been
captured (the exact mirror of how `tdd` keys on `seen_failing`):

1. **Capture step (pre-change).** An early, ordered step runs the metric command on the
   PRE-change code. The predicate extracts the number N0 (via the optional `extract` regex's
   capture group 1, else the last number in stdout), stores it on the proof, and **PASSes** with a
   "baseline captured" note. The engine never manipulates the target repo's git state — capture
   relies on this step running before the change lands.
2. **Compare step (post-change).** Later runs extract N1 and compare:
   - `lower_is_better: true` (default — perf, complexity, duplication): pass iff `N1 <= N0*(1+tol)`.
   - `lower_is_better: false` (coverage): pass iff `N1 >= N0*(1-tol)`.

`tol` is the predicate `value` (a fraction, e.g. `0.10` for ±10%). Output with no parseable number
**FAILs** (fail-safe — a regression proof never auto-passes on unparseable output).

### The advisory tier

A proof may set `advisory: true`: a failing advisory proof is reported **loudly as a warning** but
does **not** fail its step or the overall verdict. This is what makes a non-regression metric safe
to gate on without turning a noisy benchmark into a hard build-breaker.

- `regression` proofs **default to advisory.** Set `advisory: false` to make one a hard SLA gate.
- The advisory flag and `lower_is_better` are part of the **proof fingerprint**, so a hard gate
  cannot be silently downgraded to advisory, nor the compare direction quietly flipped, without
  tamper detection firing.
- **Optional, never mandatory.** The `performance`/`complexity`/`coverage`/`duplication` categories
  are never added to the hard-mandatory set and never block `dod_create`.

See [language-commands.md](language-commands.md) (Regression Metrics) for per-language commands.
