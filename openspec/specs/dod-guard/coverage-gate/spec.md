# dod-guard/coverage-gate Specification

## Purpose
Binds OpenSpec scenarios to tests via `// covers:` markers in test files, enumerates coverage across a change or the whole spec tree, reports each scenario's state, and ratchets a baseline so coverage can only improve.
## Requirements
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

#### Scenario: A previously baselined scenario reaches a better outcome

- **WHEN** the baseline holds a scenario at one outcome and the current run
  reports that same scenario at a strictly better outcome (for example
  unwired to covered-but-not-integrated)
- **THEN** cover reports it as improved and does not fail the run because of
  it; the baseline is not rewritten until a separate `--write-baseline` run

#### Scenario: A baselined scenario id is missing from a whole-tree run

- **WHEN** `dod-guard cover --all` runs and a scenario id the baseline holds
  does not appear among the current run's scenario ids - because a
  requirement or scenario title was renamed, which changes the id, or the
  capability was deleted
- **THEN** cover reports the id as orphaned and does not fail the run because
  of it; running `dod-guard cover --all --write-baseline` rewrites the whole
  baseline map from the current run and drops the orphaned id, which is the
  intended way to clear a legitimate rename or deletion

#### Scenario: A change-scoped run never reports an orphan

- **WHEN** `dod-guard cover <change-id>` runs without `--all`
- **THEN** cover does not compute or report orphaned scenario ids, even
  though the change's own handful of scenarios leaves most of the baseline's
  ids unmentioned in that run - a scoped run's absence of an id is not
  evidence anything vanished

### Requirement: The coverage gate is a CI ratchet with a tighten step

`scripts/ci/check-coverage-gate.mjs` SHALL run `dod-guard cover --all` against
a freshly built and bundled `packages/dod-guard/dist/bundle.js`, in the
`static-analysis` CI job, in place of the deleted `check-trace.mjs`. It SHALL
accept a `--write-baseline` flag and pass it through to the underlying
`dod-guard cover --all` invocation. `static-analysis` SHALL run this ratchet
with `continue-on-error: true`, and follow it with a tighten step that reruns
the check with `--write-baseline` whenever the ratchet's own report names an
adopted or improved scenario, mirroring the quality, test-presence, audit and
per-package coverage ratchets already in that job. The `plugin-config` job
SHALL NOT run this ratchet, because it holds no write permission and a second
job pushing baseline commits would race `static-analysis`'s own push.

#### Scenario: CI runs the coverage gate

- **WHEN** the `static-analysis` job runs on a push to `master`
- **THEN** it builds and bundles `packages/dod-guard`, then runs
  `dod-guard cover --all`, and the job's "Enforce ratchet outcomes" step fails
  if that run reported a regression

#### Scenario: CI tightens the coverage-gate baseline on improvement

- **WHEN** the coverage-gate ratchet step succeeds (no regression) and its
  report names at least one `adopted:` or `improved:` scenario
- **THEN** the "Tighten coverage-gate baseline" step reruns
  `check-coverage-gate.mjs --write-baseline`, and the resulting baseline
  change is committed and pushed alongside the other tightened baselines

