# dod-guard/tighten Specification

## Purpose
Autonomous loop that removes accidental complexity one target at a time. Ranks the repository by structural violations joined against git return-churn, blind-rewrites the worst target, and gates the result on both difference and simplicity. One target per invocation.

## Requirements

### Requirement: ledger seeded from scanner and git churn
The skill SHALL run `quality-scan.mjs --format=units` and `seed-ledger.mjs` to build `.tighten/ledger.json`. Each entry's rank is the product of its violation count and its git return-churn. The ledger persists across invocations.

#### Scenario: ledger built from scan and history
- **WHEN** the skill runs on a repository for the first time
- **THEN** it produces a `ledger.json` with one entry per source file, ranked by violations times churn

#### Scenario: reseed refreshes scores and keeps results
- **WHEN** `seed-ledger.mjs` runs on a repository that already has a ledger
- **THEN** it refreshes the scores from current violations and git history while keeping every recorded result

#### Scenario: formatting rules score zero
- **WHEN** the scanner reports violations for formatting-only rules
- **THEN** those violations score zero in the ranking and do not inflate a target's rank

### Requirement: target picked from ledger
The skill SHALL run `pick-target.mjs` to select the highest-ranked unprocessed target. Exit 4 means the queue is empty. Exit 3 is a usage error. The skill SHALL NOT pick targets manually.

#### Scenario: queue empty
- **WHEN** `pick-target.mjs` exits with code 4
- **THEN** the skill reports that no targets remain and stops

#### Scenario: target picked successfully
- **WHEN** `pick-target.mjs` exits 0 and prints a target path
- **THEN** the skill opens or resumes a change at id `tighten-<slug>` for that target

#### Scenario: usage error on pick
- **WHEN** `pick-target.mjs` exits with code 3
- **THEN** the skill reports the usage error and stops

#### Scenario: target with archived change skipped
- **WHEN** a target's change id has already been archived
- **THEN** `pick-target.mjs` skips it and picks the next highest-ranked target

### Requirement: clean tree required before rewrite
The skill SHALL check `git status` before any rewrite. On a dirty tree it SHALL stop and tell the user, because later phases delete files and roll back with `git checkout`, which would destroy uncommitted work.

#### Scenario: dirty tree blocks the skill
- **WHEN** `git status` shows uncommitted changes
- **THEN** the skill stops and tells the user to commit or stash first

#### Scenario: clean tree allows the skill to proceed
- **WHEN** `git status` shows a clean working tree
- **THEN** the skill proceeds to pick a target

### Requirement: intent analysis separates necessary from accidental
The skill SHALL dispatch `intent-analyst` to classify the target's complexity. The analyst infers the goal from callers, tests, and types rather than from the code itself, and emits a complexity budget. A mostly-essential result narrows the budget but never stops the cycle.

#### Scenario: mostly essential target
- **WHEN** the intent analyst classifies most of the target's complexity as necessary
- **THEN** the rewrite proceeds with a narrow budget targeting only the accidental complexity

#### Scenario: mostly accidental target
- **WHEN** the intent analyst classifies most of the target's complexity as accidental
- **THEN** the rewrite proceeds with a wide budget

#### Scenario: analyst returns complexity budget
- **WHEN** the intent analyst finishes
- **THEN** it provides a complexity budget stated as a positive target, such as how many decisions or data passes

### Requirement: oracle before rewrite
The skill SHALL ensure test coverage exists before rewriting. For targets with existing tests, those tests serve as the oracle. For targets with no coverage, the skill dispatches `characterization-writer` and vets the proposed tests with `intent-analyst` to reject tests that pin accidental behavior.

#### Scenario: characterization tests vetted
- **WHEN** the characterization writer proposes a test that asserts on an internal implementation detail
- **THEN** the intent analyst rejects that test and it is not included in the oracle

#### Scenario: existing test suite serves as oracle
- **WHEN** the target already has tests that cover the boundary the analyst named
- **THEN** those existing tests serve as the oracle without dispatching `characterization-writer`

#### Scenario: characterization tests committed separately
- **WHEN** new characterization tests are written for a target with no suite
- **THEN** the skill commits them in their own commit before the rewrite, so rollback keeps the oracle

### Requirement: contract extraction and blind rewrite
The skill SHALL dispatch `blind-contract-extractor` to extract the behavioral contract, merge it with the intent analysis, drop only ACCIDENTAL items, and dispatch `blind-writer` with the pruned contract. The writer has no shell access; the orchestrator runs tests on its behalf.

#### Scenario: ACCIDENTAL items dropped from contract
- **WHEN** the intent analyst classified a retry-with-exponential-backoff as ACCIDENTAL (a simpler retry would suffice)
- **THEN** the contract sent to the blind writer describes "retry on failure" without specifying exponential backoff

#### Scenario: UNKNOWN items kept in contract
- **WHEN** the intent analyst tagged a behavior as UNKNOWN
- **THEN** the merged contract keeps that item, because a tie keeps the behavior

#### Scenario: contract screened against banned vocabulary
- **WHEN** the merged contract contains an interior name from the deleted code
- **THEN** the skill strips it before passing the contract to the blind writer

### Requirement: two gates - overlap AND simplicity
After the blind write, the skill SHALL run `overlap-scan.mjs` (exit 0 = genuinely different) AND `simplicity-gate.mjs` (exit 0 = simpler than the original). Both SHALL pass. One redispatch of the blind writer is allowed on failure.

#### Scenario: both gates pass
- **WHEN** `overlap-scan.mjs` exits 0 and `simplicity-gate.mjs` exits 0
- **THEN** the skill proceeds to the gap audit

#### Scenario: simpler but not different
- **WHEN** `simplicity-gate.mjs` passes but `overlap-scan.mjs` fails
- **THEN** the skill redispatches the blind writer once with instructions to diverge structurally

#### Scenario: different but not simpler
- **WHEN** `overlap-scan.mjs` passes but `simplicity-gate.mjs` fails
- **THEN** the skill redispatches the blind writer once with instructions to reduce complexity

#### Scenario: gates fail after redispatch
- **WHEN** the redispatched rewrite also fails at least one gate
- **THEN** the skill restores the original and exits the cycle

### Requirement: gap audit as final check
The skill SHALL dispatch `blind-gap-auditor` to compare the replacement against the original. Only behavioral or claim gaps count; style and design preferences do not. Gaps in items the intent analyst classified as ACCIDENTAL are expected and not flagged.

#### Scenario: behavioral gap found
- **WHEN** the gap auditor finds the replacement dropped a timeout parameter the callers depend on
- **THEN** the skill repairs the gap as a sighted edit and re-runs the gates

#### Scenario: gap in ACCIDENTAL item not flagged
- **WHEN** the gap auditor reports a gap that matches an item the analyst classified as ACCIDENTAL
- **THEN** the skill ignores that gap, because the dropped behavior was intentional

#### Scenario: no gaps found
- **WHEN** the gap auditor reports no behavioral gaps
- **THEN** the skill proceeds to the close phase

### Requirement: ledger records outcome
The skill SHALL run `record-result.mjs` with the outcome: `accepted` (rewrite landed), `pending` (first failure, eligible for retry), or `resistant` (two failures, permanently closed). A `resistant` target is never picked again.

#### Scenario: accepted outcome recorded
- **WHEN** a rewrite passes both gates and the gap audit
- **THEN** `record-result.mjs` records the target as `accepted` with the commit sha

#### Scenario: first failure records pending
- **WHEN** an invocation fails on its first attempt for this target
- **THEN** `record-result.mjs` records the target as `pending`, allowing one future attempt

#### Scenario: second failure records resistant
- **WHEN** a second invocation also fails for the same target
- **THEN** `record-result.mjs` records the target as `resistant` with a reason, closing it permanently

### Requirement: merge is human-owned
The skill SHALL NOT merge the tighten branch to master. It SHALL print the merge procedure and stop. The user runs the merge, the CI check, and the archive command. Approval for one merge covers that merge alone.

#### Scenario: merge procedure printed after accepted target
- **WHEN** the branch holds at least one accepted commit
- **THEN** the skill prints the merge, CI check, and archive procedure and stops

#### Scenario: version bump in diff triggers warning
- **WHEN** the diff includes a `package.json` version bump
- **THEN** the skill warns the user that pushing to master will publish that package
