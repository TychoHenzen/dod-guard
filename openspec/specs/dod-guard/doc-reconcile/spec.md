# dod-guard/doc-reconcile Specification

## Purpose
Skill that finds documents contradicting each other, dates each conflicting claim from git edit history, and deletes the older side when the dating is decisive. Resolves documentation drift without blending claims into new prose.

## Requirements

### Requirement: candidate pairs come from the scanner
The skill SHALL use `scan-docs.mjs` to find candidate claim pairs scored by vocabulary overlap. It SHALL NOT manually read documents looking for contradictions.

#### Scenario: scanner produces pairs
- **WHEN** the skill runs `scan-docs.mjs` on the repository
- **THEN** it receives candidate pairs with file paths, line ranges, heading context, and claim text for each side

#### Scenario: scanner finds no pairs above the threshold
- **WHEN** `scan-docs.mjs` runs and no pair scores above the configured `--threshold`
- **THEN** the skill reports that no contradictions were found and exits without dispatching any judge agents

#### Scenario: scanner exits with a usage error
- **WHEN** `scan-docs.mjs` exits with code 3
- **THEN** the skill reports the usage error to the user and stops

### Requirement: each pair gets a verdict from the judge agent
The skill SHALL dispatch `doc-conflict-judge` for each candidate pair. The judge returns exactly one of CONFLICT, DUPLICATE, STALE-SUBSET, or UNRELATED. The skill SHALL NOT override the judge's verdict.

#### Scenario: judge classifies a pair as CONFLICT
- **WHEN** two claims state different numbers for the same quantity
- **THEN** the judge returns CONFLICT with quoted evidence from both sides

#### Scenario: judge classifies a pair as UNRELATED
- **WHEN** two claims share vocabulary but address different subjects
- **THEN** the judge returns UNRELATED and the skill takes no action on that pair

#### Scenario: judge classifies a pair as STALE-SUBSET
- **WHEN** one claim says less than the other without contradicting it
- **THEN** the judge returns STALE-SUBSET and the skill leaves both claims alone

### Requirement: dating uses git line history, not blame
The skill SHALL use `claim-age.mjs` to date each claim by tracing the line through `git log -L`, skipping format-only commits. Dates within the configured `--min-gap` produce an AMBIGUOUS result. `git blame` SHALL NOT be used because rewrap and autofix commits mislead it.

#### Scenario: decisive dating identifies the older claim
- **WHEN** claim A was last meaningfully edited 6 months ago and claim B was edited last week, and the gap exceeds `--min-gap`
- **THEN** `claim-age.mjs` returns DECISIVE with claim A as the older side

#### Scenario: ambiguous dating blocks deletion
- **WHEN** both claims were last meaningfully edited within the `--min-gap` window
- **THEN** `claim-age.mjs` returns AMBIGUOUS and the skill does not delete either side

#### Scenario: uncommitted file forces AMBIGUOUS
- **WHEN** one of the two claims lives in a file with uncommitted changes
- **THEN** `claim-age.mjs` dates that file as `uncommitted`, returns AMBIGUOUS, and exits 1

### Requirement: deletion follows the verdict-by-dating action table
The skill SHALL delete only when the verdict is CONFLICT or DUPLICATE and the dating is DECISIVE. For CONFLICT+DECISIVE it deletes the older claim. For DUPLICATE+DECISIVE it keeps the newer and adds a pointer. STALE-SUBSET and UNRELATED pairs are left alone. The skill SHALL NOT write fresh blended sentences.

#### Scenario: CONFLICT with decisive dating deletes the older claim
- **WHEN** the judge returns CONFLICT and `claim-age.mjs` returns DECISIVE with claim A older
- **THEN** the skill deletes claim A's text and keeps claim B

#### Scenario: DUPLICATE with decisive dating
- **WHEN** the judge returns DUPLICATE and dating is DECISIVE with claim B older
- **THEN** the skill deletes claim B's text and adds a pointer from B's location to claim A's document

#### Scenario: CONFLICT or DUPLICATE with ambiguous dating changes nothing
- **WHEN** the judge returns CONFLICT or DUPLICATE and dating is AMBIGUOUS
- **THEN** the skill leaves both claims in place and carries the pair forward as undecided

### Requirement: run cap and edit scope
The skill SHALL dispatch at most 20 judge agents per run. Edits SHALL touch only the files and line ranges the scanner named. No edits outside those ranges are allowed.

#### Scenario: more than 20 pairs found
- **WHEN** `scan-docs.mjs` returns 25 candidate pairs
- **THEN** the skill processes only the top 20 by score and reports the remaining 5 as unprocessed

#### Scenario: edits stay within scanner-named ranges
- **WHEN** the skill deletes a claim
- **THEN** the edit touches only the file and line range the scanner reported for that claim, with no changes outside those ranges

#### Scenario: dirty working tree blocks the run
- **WHEN** the working tree has uncommitted changes
- **THEN** the skill asks the user to commit or stash before proceeding, because an uncommitted file cannot be dated
