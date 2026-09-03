# dod-guard/clean-house Specification

## Purpose
Skill that hunts duplicate and obsolete implementations using git archaeology, proves removal is safe through reference sweeps and impact analysis, and deletes them after user approval.

## Requirements

### Requirement: candidate collection uses file and symbol patterns
The skill SHALL search for duplicates using ripgrep pattern scans (file-name variants, directory variants, dual definitions, symbols defined in two places) and jscpd for clone detection. Each candidate pair SHALL be classified as strong, fair, or weak confidence.

#### Scenario: file-name variant detection
- **WHEN** the skill scans a directory and finds `auth.ts` and `auth-v2.ts`
- **THEN** it reports a candidate pair with the file paths, the pattern that matched, and a confidence level

#### Scenario: weak pair reported without investigation
- **WHEN** a candidate pair has less than strong or fair confidence
- **THEN** the skill reports it in one line and investigates no further

#### Scenario: overbroad pattern is dropped
- **WHEN** a name pattern matches a large share of the repository
- **THEN** the skill drops that pattern, reports that it measured the naming convention rather than decay, and moves on

### Requirement: dating uses git history, not file metadata
The skill SHALL date each candidate pair using `git log` on creation commits and post-creation activity. It SHALL classify each post-creation commit (bugfix, feature addition, refactor, format-only). File system timestamps SHALL NOT be used.

#### Scenario: newer file has all activity
- **WHEN** one file in a pair was created later and has all commits since the other's last meaningful edit
- **THEN** the skill classifies the older file as the removal candidate

#### Scenario: older side has more recent commits
- **WHEN** the older file in a pair holds the more recent commits
- **THEN** the skill checks which side the codebase imports, which has tests, and which the deployed build includes before classifying either side

#### Scenario: post-creation fixes ported before deletion
- **WHEN** the older side received a bugfix after the newer side was created
- **THEN** the skill ports that fix to the newer side first, runs the newer side's tests, and commits before deleting the older side

### Requirement: removal proof requires four checks
Before proposing a deletion, the skill SHALL confirm: no blocking references exist (published exports, production config, live routes, user-facing docs), tests cover the surviving implementation, the impact radius is bounded, and no orphaned dependencies remain.

#### Scenario: blocking reference prevents deletion
- **WHEN** a candidate file is imported by a published package entry point
- **THEN** the skill reports the reference as a blocker and does not propose deletion of that file

#### Scenario: survivor has no tests
- **WHEN** the surviving side of a pair has no tests covering its behavior
- **THEN** the skill stops and reports that deletion would trade tested code for a guess, and does not propose it

#### Scenario: live reference updated to call the newer side
- **WHEN** a reference to the dying side exists and the newer side offers the same behavior
- **THEN** the skill plans an edit to update the reference site and lists it beside the deletion it unblocks

#### Scenario: orphaned dependency removed with the dead side
- **WHEN** a dependency's only consumer is the file being deleted
- **THEN** the skill includes the dependency removal in the same deletion batch

### Requirement: user approval before any deletion
The skill SHALL present the exact list of files to delete, the evidence for each, and the surviving counterpart. It SHALL wait for explicit user approval before running `git rm`. Partial approval (some files yes, some no) SHALL be honored.

#### Scenario: partial approval
- **WHEN** the user approves deletion of 2 out of 3 proposed files
- **THEN** the skill deletes only the 2 approved files and leaves the third untouched

#### Scenario: full approval deletes the entire list
- **WHEN** the user approves all proposed deletions
- **THEN** the skill deletes every item and removes orphaned dependencies whose only consumer was a deleted file

#### Scenario: new item discovered mid-run
- **WHEN** the migration reveals a dead file not in the original list
- **THEN** the skill returns to the user with a corrected list and waits for fresh approval before deleting it

### Requirement: post-deletion verification
After deletion, the skill SHALL run the build, test suite, and linter. It SHALL also run a final ripgrep sweep for any remaining references to deleted symbols.

#### Scenario: build fails after deletion
- **WHEN** the build fails after deleting approved files
- **THEN** the skill reports the failure and offers to roll back with `git checkout HEAD~1`

#### Scenario: build, tests, and linter all pass
- **WHEN** the build, test suite, and linter all pass after deletion
- **THEN** the skill runs a final ripgrep sweep for the deleted names and reports any remaining references

#### Scenario: stale import found by linter
- **WHEN** the linter reports an import referencing a deleted file
- **THEN** the skill reports the stale import as a remaining reference that needs cleanup
