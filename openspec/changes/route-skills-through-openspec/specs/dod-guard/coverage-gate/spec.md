## ADDED Requirements

### Requirement: A scenario binds to a test through a marker in the test file

`dod-guard cover` SHALL bind a scenario to a test by reading a `// covers:`
comment placed directly above a `test(`/`it(` call in a test file, not by
matching a scenario title against a test title.

#### Scenario: A test file carries a covers marker above a test call

- **WHEN** a test file has a `// covers: <group>/<capability> :: <requirement
  title> :: <scenario title>` comment on the line directly above a `test(` or
  `it(` call
- **THEN** `dod-guard cover` binds that scenario id to that call's test name
  and file path

#### Scenario: A marker with no test call after it binds nothing

- **WHEN** a `// covers:` comment is followed by blank lines and then
  end-of-file, or by a line that is not a `test(`/`it(` call
- **THEN** `dod-guard cover` binds nothing for that marker, and the scenario
  it named is reported the same as if the marker were never written

### Requirement: cover enumerates scenarios from a change's deltas or the main spec tree

`dod-guard cover` SHALL support two enumeration modes that emit the same
report shape and check against the same baseline: a change-scoped run for a
developer or a `verify_cmd`, and a whole-tree run for CI, whose authority has
to include capabilities no active change touches.

#### Scenario: cover reads one change's spec deltas

- **WHEN** a developer runs `dod-guard cover <change-id>`
- **THEN** cover reads every scenario declared under
  `openspec/changes/<change-id>/specs/**/spec.md`

#### Scenario: cover --all reads the main spec tree

- **WHEN** CI runs `dod-guard cover --all`
- **THEN** cover reads every scenario declared under
  `openspec/specs/**/spec.md`, including a capability whose introducing
  change has already archived

#### Scenario: Neither a change id nor --all is given

- **WHEN** `dod-guard cover` runs with no change id and without `--all`
- **THEN** cover exits with the usage-error code and prints that one of the
  two is required

### Requirement: cover reports a scenario's state

`dod-guard cover` SHALL report every enumerated scenario as either unwired (no
test binds it) or bound (a marker binds it to a named test). Distinguishing a
bound test that merely runs from one that reaches the scenario's
implementation through a project-declared entry point is a later requirement;
until then a bound scenario reports as covered-but-not-integrated, naming the
test and file it is bound to.

#### Scenario: No test binds a scenario

- **WHEN** a scenario has no `// covers:` marker anywhere in its group's test
  files
- **THEN** cover reports the scenario as unwired

#### Scenario: A marker binds a scenario to a test

- **WHEN** a scenario has a `// covers:` marker binding it to a test
- **THEN** cover reports the scenario as covered-but-not-integrated, naming
  the bound test and its file

### Requirement: The coverage-gate ratchet adopts unseen scenarios and blocks on regression

`dod-guard cover` SHALL check its report against
`.github/quality/coverage-gate-baseline.json`, keyed by scenario id. A
scenario absent from the baseline SHALL be adopted at its current outcome
rather than failing as a drop from an assumed-covered state. A scenario
already in the baseline that regresses to a worse outcome SHALL fail the run.

#### Scenario: A scenario absent from the baseline is adopted

- **WHEN** `dod-guard cover` runs without `--write-baseline` and finds a
  scenario id the baseline has no entry for
- **THEN** cover reports it as adopted and does not fail the run because of it

#### Scenario: A previously covered-and-integrated scenario regresses

- **WHEN** the baseline holds a scenario as covered-and-integrated and the
  current run reports it as anything else
- **THEN** cover reports the regression and exits with the regression exit
  code

#### Scenario: A scenario that stays unwired is not a regression

- **WHEN** the baseline holds a scenario as unwired and the current run also
  reports it as unwired
- **THEN** cover does not report a regression for that scenario

#### Scenario: --write-baseline records the current report as the new baseline

- **WHEN** `dod-guard cover` runs with `--write-baseline`
- **THEN** cover writes every enumerated scenario's current outcome to
  `.github/quality/coverage-gate-baseline.json` and exits without checking
  for regressions

### Requirement: The coverage gate replaces trace in CI

`scripts/ci/check-coverage-gate.mjs` SHALL run `dod-guard cover --all` against
a freshly built and bundled `packages/dod-guard/dist/bundle.js`, in the
`plugin-config` CI job, in place of the deleted `check-trace.mjs`.

#### Scenario: CI runs the coverage gate

- **WHEN** the `plugin-config` job runs on a push to `master`
- **THEN** it builds and bundles `packages/dod-guard`, then runs
  `dod-guard cover --all`, and the job fails if that run reports a regression
