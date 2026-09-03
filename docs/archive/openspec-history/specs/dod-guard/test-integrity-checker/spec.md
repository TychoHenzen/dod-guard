# dod-guard/test-integrity-checker Specification

## Purpose
Audits test files for tests that match the implementation rather than a specification. Dispatches an auditor agent with mutation data and repairs the tests it finds deficient.

## Requirements

### Requirement: mutation data seeds the audit when available
The skill SHALL run `node scripts/mutation-queue.mjs` to produce `.data/micro-mutations/queue.json`. When mutation data exists, the dispatch prompt SHALL include hotspot lines and survival counts. When the script is absent or fails, the skill SHALL fall back to manual file pairing via ripgrep.

#### Scenario: mutation data available
- **WHEN** `mutation-queue.mjs` produces queue data with hotspots for a test file
- **THEN** the auditor dispatch includes the hotspot lines and mutator names in its prompt

#### Scenario: no mutation tooling
- **WHEN** `mutation-queue.mjs` does not exist or exits non-zero
- **THEN** the skill pairs test files to production files using ripgrep filename patterns and proceeds without hotspot data

#### Scenario: stale mutation data triggers rerun
- **WHEN** a queue entry has stale set to true
- **THEN** the skill reruns micro-mutations before using that entry's hotspots

#### Scenario: null test file skipped
- **WHEN** a queue entry has test set to null
- **THEN** the skill logs the entry and moves to the next one in queue order

### Requirement: one auditor dispatch per unit
The skill SHALL dispatch `dod-guard:test-integrity-auditor` once per production-file/test-file pair. Each dispatch receives both file paths and any available mutation data. At most one retry per unit is allowed when the answer is unreadable.

#### Scenario: auditor dispatched with file pair
- **WHEN** the skill identifies `auth.ts` paired with `auth.test.ts`
- **THEN** it dispatches one `test-integrity-auditor` agent with both paths

#### Scenario: unreadable answer retried once
- **WHEN** the auditor returns neither findings nor a NO_FINDINGS line
- **THEN** the skill dispatches the auditor one more time for that unit

#### Scenario: second unreadable answer ends the unit
- **WHEN** the retry also returns neither findings nor NO_FINDINGS
- **THEN** the skill marks the unit as done with no findings

### Requirement: findings carry severity and pattern labels
Each finding SHALL be labeled with a SEVERITY (critical, major, minor, info) and a PATTERN (logic-mirroring, output-blessing, weak-assertions, mock-everything, symmetry-inverse, happy-path-only, copy-paste-parameterization). The integrity verdict is INTEGRITY_FAIL when any critical finding exists, INTEGRITY_WEAK when major is the worst, and INTEGRITY_PASS otherwise.

#### Scenario: critical finding produces FAIL verdict
- **WHEN** the auditor finds a logic-mirroring pattern with critical severity
- **THEN** the unit's verdict is INTEGRITY_FAIL

#### Scenario: major finding produces WEAK verdict
- **WHEN** the worst finding in the auditor's reply is major severity
- **THEN** the unit's verdict is INTEGRITY_WEAK

#### Scenario: no critical or major produces PASS verdict
- **WHEN** the auditor's reply contains only minor or info findings
- **THEN** the unit's verdict is INTEGRITY_PASS

### Requirement: repaired assertions use valid origins only
Repaired assertion values SHALL come from one of four sources: a specification, a manual calculation, a known-good reference implementation, or a standard test vector for the domain. Values copied from the current production output SHALL NOT be used.

#### Scenario: assertion derived from spec
- **WHEN** a test's expected value was copied from production output (output-blessing)
- **THEN** the repair derives the expected value from the requirement or manual calculation

#### Scenario: no valid origin available
- **WHEN** none of the four qualified origins is accessible for a finding
- **THEN** the skill keeps the assertion unchanged and carries the finding unrepaired with a TODO

### Requirement: fault demonstration required for each repaired test
Each repaired test SHALL demonstrate a fault. The skill breaks the production code in a way the old test would not catch, shows the repaired test fails, restores the code, and shows the repaired test passes. Mutation-traced findings use the surviving mutation as the fault.

#### Scenario: fault demonstrated via code break
- **WHEN** a test is repaired to catch a logic-mirroring pattern
- **THEN** the skill introduces a deliberate bug, the repaired test fails, then the revert makes it pass

#### Scenario: mutation-traced finding uses surviving mutation
- **WHEN** a finding is traced to a recorded surviving mutation
- **THEN** the skill uses that mutation as the fault instead of introducing a new one

### Requirement: suite and coverage gates after repair
After all repairs, the full test suite SHALL pass. Line coverage SHALL be no lower than before the audit. Both conditions SHALL be checked before the skill reports completion.

#### Scenario: coverage drops after repair
- **WHEN** a repaired test removes a branch that previously ran production code
- **THEN** the skill reports the coverage regression and does not mark the unit as complete

#### Scenario: suite fails after repair
- **WHEN** the full test suite fails after all repairs are applied
- **THEN** the skill reports the failure and does not mark the unit as complete

#### Scenario: both gates pass
- **WHEN** the suite passes and coverage has not dropped
- **THEN** the unit is marked complete
