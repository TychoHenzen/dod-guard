# dod-guard/spec-hygiene Specification

## Purpose
Detects compound requirements in OpenSpec specs by counting RFC 2119 obligation
keywords per requirement and comparing to scenario count, so undertested claims
become visible in CI and the dashboard.
## Requirements
### Requirement: A shared module counts obligation keywords in requirement text

The module SHALL count occurrences of `SHALL`, `MUST`, `SHOULD`, `MAY`,
`REQUIRED`, `OPTIONAL`, and `RECOMMENDED` (case-insensitive, word-boundary
matched) in the requirement body text between the `### Requirement:` heading and
the first `#### Scenario:` heading beneath it. The module SHALL return the
keyword count and the scenario count for that requirement. The difference
(keyword count minus scenario count) is the obligation delta.

#### Scenario: A requirement with five obligations and one scenario

- **WHEN** a requirement body contains five `SHALL` keywords and has one
  scenario beneath it
- **THEN** the module returns an obligation count of 5, a scenario count of 1,
  and a delta of 4

#### Scenario: A requirement with one obligation and three scenarios

- **WHEN** a requirement body contains one `MUST` keyword and has three
  scenarios beneath it
- **THEN** the module returns an obligation count of 1, a scenario count of 3,
  and a delta of -2

#### Scenario: A requirement with no obligation keywords

- **WHEN** a requirement body contains no RFC 2119 keywords
- **THEN** the module returns an obligation count of 0

#### Scenario: Keywords inside scenario blocks are not counted

- **WHEN** a requirement body contains one `SHALL` and a scenario beneath it
  contains two more `SHALL` keywords in its WHEN/THEN text
- **THEN** the module returns an obligation count of 1, not 3

#### Scenario: Case-insensitive matching

- **WHEN** a requirement body contains `shall`, `Shall`, and `SHALL`
- **THEN** the module counts all three as obligation keywords

#### Scenario: Word-boundary matching avoids false positives

- **WHEN** a requirement body contains `marshall` or `should-not` or
  `OPTIONAL_FLAG`
- **THEN** the module does not count any of those as obligation keywords

### Requirement: The lint script reports compound requirements as warnings

`check-spec-hygiene.mjs` SHALL walk every `openspec/specs/**/spec.md` file,
compute the obligation delta for each requirement, and print a warning line for
each requirement whose delta is greater than zero. The warning SHALL name the
spec id, the requirement title, the obligation count, and the scenario count.

#### Scenario: A spec tree with compound and clean requirements

- **WHEN** `check-spec-hygiene.mjs` runs over a spec tree containing one
  requirement with delta 4 and one with delta 0
- **THEN** it prints one warning naming the first requirement and prints
  nothing for the second

#### Scenario: All requirements are clean

- **WHEN** `check-spec-hygiene.mjs` runs over a spec tree where every
  requirement has delta 0 or less
- **THEN** it prints no warnings and exits 0

### Requirement: The lint script exits 0 in warning mode and 1 in strict mode

`check-spec-hygiene.mjs` SHALL exit 0 after printing warnings unless the
`--strict` flag is passed. With `--strict`, the script SHALL exit 1 when any
requirement has a positive delta.

#### Scenario: Warnings found without --strict

- **WHEN** `check-spec-hygiene.mjs` finds compound requirements and `--strict`
  is not passed
- **THEN** it exits 0

#### Scenario: Warnings found with --strict

- **WHEN** `check-spec-hygiene.mjs` finds compound requirements and `--strict`
  is passed
- **THEN** it exits 1

#### Scenario: No warnings with --strict

- **WHEN** `check-spec-hygiene.mjs` finds no compound requirements and
  `--strict` is passed
- **THEN** it exits 0

### Requirement: The lint script prints a summary line

`check-spec-hygiene.mjs` SHALL print a summary line at the end of its output
naming the total requirement count, the compound count, and the total uncovered
obligation count across all specs.

#### Scenario: Summary line content

- **WHEN** `check-spec-hygiene.mjs` runs over a spec tree with 200
  requirements, 50 compound, totaling 120 uncovered obligations
- **THEN** the summary line reads `200 requirements, 50 compound, 120
  uncovered obligations`

### Requirement: The lint script runs in CI alongside check-skill-hygiene

`check-spec-hygiene.mjs` SHALL run in the `plugin-config` CI job, after
`check-skill-hygiene.mjs`. It SHALL run without `--strict` so it does not block
the build.

#### Scenario: CI runs the spec hygiene check

- **WHEN** the `plugin-config` job runs on a push to `master`
- **THEN** the job runs `node scripts/ci/check-spec-hygiene.mjs` and the step
  does not fail the build

### Requirement: The spec-split skill walks compound requirements interactively

The `/spec-split` skill SHALL present each compound requirement (delta > 0) to
the user, propose one new scenario per uncovered obligation, and wait for the
user to confirm, edit, or reject each proposed scenario before writing it to the
spec file.

#### Scenario: A compound requirement with delta 3

- **WHEN** the user runs `/spec-split` on a spec containing a requirement with
  3 obligations and 0 scenarios
- **THEN** the skill proposes 3 new scenarios, one per obligation, and waits
  for user confirmation before writing any

#### Scenario: User rejects a proposed scenario

- **WHEN** the user rejects one of the proposed scenarios
- **THEN** the skill does not write it and moves to the next proposal

### Requirement: The spec-split skill re-assigns test bindings after a split

When a compound scenario with a bound test splits into sub-scenarios, the skill
SHALL read the bound test's assertions, match each assertion against the
sub-scenarios, and bind the test to the sub-scenario it covers. Sub-scenarios
with no matching assertion SHALL be left unbound.

#### Scenario: A bound compound scenario splits into three

- **WHEN** a scenario bound to test `test_vocab_lowercase` splits into three
  sub-scenarios covering lowercase, sorted, and length
- **THEN** the skill binds `test_vocab_lowercase` to the lowercase sub-scenario
  and leaves the sorted and length sub-scenarios unbound

#### Scenario: A compound scenario with no bound test splits

- **WHEN** an unbound compound scenario splits into sub-scenarios
- **THEN** all sub-scenarios remain unbound

