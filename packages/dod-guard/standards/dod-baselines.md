# Company DoD Baselines

These are company-level Definition of Done standards. Every DoD created via dod-guard
must include **at minimum** the proofs listed for the applicable work type.

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

The Gate column names the company standard being met. The Category column is
the `category` field on the proof, which takes one of four values.

| Standard | Gate | Predicate | Category | Notes |
|----------|------|-----------|----------|-------|
| Lint/SonarQube clean | Lint | `output_not_contains` or `exit_code: 0` | `other` | Scope to changed files. Use a delta count when the project carries existing debt. |
| Code standards (format) | Format | `exit_code: 0` | `other` | Dry-run before and after. Assert the violation count stays the same or drops. Never auto-format. |
| Regression test exists | TDD | `tdd: 0` | `behavioral` | The test for the bug must fail first, then pass. |
| Regression test has real assertions | Structure | `output_matches` | `test_audit` | Search for an assert on the bug-specific condition. |
| All existing tests pass | Test | `exit_code: 0` | `behavioral` | Full test suite through the language test runner. |
| **Integration (wiring)** | **Integration** | `output_matches` or `exit_code: 0` | `wiring` | **Mandatory.** Structural search proving the fix is connected to the system (import in a real caller, route registration, config entry). |
| **Integration (behavioral)** | **Integration** | `exit_code: 0` or `output_contains` | `behavioral` | **Mandatory.** Exercise the fix through the system's real entry point, such as an API call, a CLI invocation, or a full page render. Not through a test harness that bypasses the wiring. Last machine-checkable step. |
| Application walkthrough | Manual | draft leaf | none | `MANUAL: run the app, confirm the fix works and nothing else broke` |
| Code review | Manual | draft leaf | none | `MANUAL: reviewed by another developer` |
| Released to environment | Manual | draft leaf | none | `MANUAL: deployed to the correct environment` |
| Test databases removed | Manual | draft leaf | none | `MANUAL: dev and test databases cleaned up` |

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

| Standard | Gate | Predicate | Category | Notes |
|----------|------|-----------|----------|-------|
| Lint/SonarQube clean | Lint | `output_not_contains` or `exit_code: 0` | `other` | Scope to changed files. Use a delta count when the project carries existing debt. |
| Code standards (format) | Format | `exit_code: 0` | `other` | Dry-run before and after. Assert the violation count stays the same or drops. Never auto-format. |
| New unit tests (TDD) | TDD | `tdd: 0` | `behavioral` | Tests for new code must fail first, then pass. |
| New tests have real assertions | Structure | `output_matches` | `test_audit` | Search for meaningful assertions. |
| All existing tests pass | Test | `exit_code: 0` | `behavioral` | Full test suite through the language test runner. |
| No regressions introduced | Test | `exit_code: 0` | `behavioral` | Full test suite still green. |
| Documentation exists | Structure | `exit_code: 0` | `other` | Search for docs on the new component. |
| **Integration (wiring)** | **Integration** | `output_matches` or `exit_code: 0` | `wiring` | **Mandatory.** Structural search proving the feature is connected to the system (import in a real page or route, router registration, public export). |
| **Integration (behavioral)** | **Integration** | `exit_code: 0` or `output_contains` | `behavioral` | **Mandatory.** Exercise the feature through the system's real entry point. Not through a mock harness or an isolated component test. Last machine-checkable step. |
| Application walkthrough | Manual | draft leaf | none | `MANUAL: run the app, confirm the new behavior works and nothing else broke` |
| Code review | Manual | draft leaf | none | `MANUAL: reviewed by another developer` |
| Acceptance criteria met | Manual | draft leaf | none | `MANUAL: every acceptance criterion verified` |
| Released to environment | Manual | draft leaf | none | `MANUAL: deployed to the correct environment` |
| Test databases removed | Manual | draft leaf | none | `MANUAL: dev and test databases cleaned up` |

---

## Enforcement Rules

1. **Every DoD must declare its type** — bug or general — so the correct baseline applies
2. **Machine-checkable proofs are mandatory** for: lint, tests, TDD, structure, integration. These cannot be replaced with manual proofs.
3. **TDD proofs are required** for:
   - Bug fixes: regression test proving the bug is caught
   - General: unit tests for new functionality
4. **Full test suite proof is always required** — verifies no regressions
5. **Integration proof is always required (two layers)** — a wiring proof (structural grep that the feature is connected to the real system) AND a behavioral proof (exercised through the system's actual entry point, not test harnesses). Both are mandatory. Unit tests and mock-harness tests are not integration. This is the last machine-checkable step before manual proofs.
6. **A human-verified step is a draft leaf**, never a predicate. There is no `manual` predicate, and `dod_create` rejects one. Give the leaf a `title` and an `intent` starting with `MANUAL:`, and leave `refinement` at its `draft` default. A draft holds the verdict at INCOMPLETE, which is what "a human still owes us something" should mean. Reserve this for code review, release verification, database cleanup, and acceptance sign-off.
7. **This baseline is a standard, not a gate.** `dod_create` validates the shape of what you send: `category` must be one of the four values, and `predicate.type` one of the ten. It does not count categories, so nothing here is rejected for a missing integration or test proof. The one warning it raises is for a DoD carrying no `behavioral` leaf at all, and a warning does not block. Meeting this baseline is on whoever writes the DoD.

## Proof Strength

A proof must verify **correctness**, not mere **presence**. Ranked weakest → strongest:

- **Presence (weak):** a search proving a name exists. It passes the moment any line contains the string, which is barely more than compilation. Use it only to supplement a `wiring` or `other` check, **never** as a step's sole acceptance.
- **Behavioral (strong):** `tdd`, or an `exit_code` or `output_contains` proof on a real run, filed under `behavioral`. These exercise the code and assert on results.

Every step must carry at least one strong proof. Nothing checks this for you. `dod_create` warns only when the whole DoD has no `behavioral` leaf, so a single strong proof anywhere silences it for every weak step in the tree.

Presence proofs must match a signature or a word boundary, never a bare
substring. `findstr "TryStopTracking"` matches both `TryStopTracking(dossierId)`
and `TryStopTracking(dossierId, clientId)`, so it reports a false positive. Use
`grep -w`, or `findstr /R` with anchors.

## The advisory tier

A proof may set `advisory: true`. A failing advisory proof is reported loudly as
a warning, and it does not fail its step or the overall verdict. Use it for a
check worth watching that should not break the build.

The advisory flag is part of the proof fingerprint, so a hard gate cannot be
quietly downgraded to advisory without tamper detection firing.
