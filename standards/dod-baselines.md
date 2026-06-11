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
| Application walkthrough | Manual | `manual` | Manually run the app, verify new functionality works and nothing else broke |
| Documentation exists | Structure | `exit_code: 0` | grep/find for docs on new component |
| Code review | Manual | `manual` | Reviewed by another developer |
| Acceptance criteria met | Manual | `manual` | All AC verified |
| Released to environment | Manual | `manual` | Deployed to correct environment |
| Test databases removed | Manual | `manual` | Dev/test databases cleaned up |

---

## Enforcement Rules

1. **Every DoD must declare its type** — bug or general — so the correct baseline applies
2. **Machine-checkable proofs are mandatory** for: lint, tests, TDD, structure. These cannot be replaced with manual proofs.
3. **TDD proofs are required** for:
   - Bug fixes: regression test proving the bug is caught
   - General: unit tests for new functionality
4. **Full test suite proof is always required** — verifies no regressions
5. **Manual proofs** are acceptable only for: code review, release verification, database cleanup, acceptance criteria sign-off
