# dod-guard/coverage-gate Specification

## Purpose
Binds OpenSpec scenarios to tests via `// covers:` markers in test files, enumerates coverage across a change or the whole spec tree, reports each scenario's state, and ratchets a baseline so coverage can only improve.
## Requirements
### Requirement: A scenario binds to a test through a marker in the test file

`dod-guard cover` SHALL bind a scenario to a test by reading a `covers:` comment
placed directly above a test declaration in a test file, not by matching a
scenario title against a test title. The comment prefix and the test declaration
pattern SHALL be determined by the file's extension:

| Extension | Comment prefix | Test declaration |
|-----------|---------------|------------------|
| `.ts`, `.js`, `.mjs`, `.cjs` | `//` | `test(` or `it(` |
| `.py` | `#` | `def test_` |
| `.go` | `//` | `func Test` |
| `.rs` | `//` | `fn ` preceded by `#[test]` on the previous non-blank line |
| `.rb` | `#` | `def test_` or `it ` or `it(` |
| `.java`, `.kt` | `//` | `void test` or `fun test` (case-insensitive `test` prefix) or `@Test` on the previous non-blank line followed by a method declaration |
| `.sh`, `.bash` | `#` | a function whose name starts with `test_` |

Files whose extension is not in this table SHALL be skipped without error.

#### Scenario: A test file carries a covers marker above a test call

- **WHEN** a test file has a covers marker comment on the line directly above a
  test declaration, using the comment prefix and test pattern that match the
  file's extension
- **THEN** `dod-guard cover` binds that scenario id to that declaration's test
  name and file path

#### Scenario: A marker with no test call after it binds nothing

- **WHEN** a covers marker comment is followed by blank lines and then
  end-of-file, or by a line that is not a test declaration for that file type
- **THEN** `dod-guard cover` binds nothing for that marker, and the scenario
  it named is reported the same as if the marker were never written

#### Scenario: A Python test file carries a covers marker above def test_

- **WHEN** a `.py` file has `# covers: eval/events :: R7 :: S1` on the line
  directly above `def test_probe_truth_difficulty_defaults_to_none():`
- **THEN** `dod-guard cover` binds scenario id
  `eval/events::R7||S1` to test name
  `test_probe_truth_difficulty_defaults_to_none` and that file's path

#### Scenario: A Go test file carries a covers marker above func Test

- **WHEN** a `.go` file has `// covers: mygroup/mycap :: Req1 :: Scen1` on the
  line directly above `func TestSomething(t *testing.T) {`
- **THEN** `dod-guard cover` binds the scenario to test name `TestSomething`
  and that file's path

#### Scenario: An unknown file extension is silently skipped

- **WHEN** `dod-guard cover` encounters a file with an extension not in the
  supported table (e.g. `.txt`, `.md`, `.csv`)
- **THEN** the scanner skips the file without error and does not attempt to
  parse markers from it

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

### Requirement: Test-file discovery is configurable per project

`dod-guard cover` SHALL resolve the set of test files to scan for a group by
reading `openspec/test-globs.json` at the project root. When the file does not
exist or does not contain an entry for the group, the scanner SHALL fall back to
the built-in globs (the current behavior).

#### Scenario: A project provides test-globs.json with a group entry

- **WHEN** `openspec/test-globs.json` exists at the project root and contains
  `{"eval": ["src/eval/**/*_test.py", "tests/eval/**/*.py"]}`
- **AND** `dod-guard cover` scans for group `eval`
- **THEN** the scanner uses those glob patterns to find test files for that group

#### Scenario: A project has no test-globs.json

- **WHEN** `openspec/test-globs.json` does not exist at the project root
- **AND** `dod-guard cover` scans for group `dod-guard`
- **THEN** the scanner uses the built-in glob `packages/dod-guard/src/**/*.test.ts`

#### Scenario: test-globs.json exists but has no entry for the group

- **WHEN** `openspec/test-globs.json` exists but contains no key for group `foo`
- **AND** `dod-guard cover` scans for group `foo`
- **THEN** the scanner uses the built-in glob `packages/foo/src/**/*.test.ts`

#### Scenario: test-globs.json contains an invalid entry

- **WHEN** `openspec/test-globs.json` exists and the value for a group is not
  an array of strings
- **THEN** `dod-guard cover` exits with the usage-error code and names the
  malformed key

### Requirement: cover refuses a change whose task groups are not expanded

A change-scoped `dod-guard cover <change-id>` run SHALL read the change's
`tasks.md` and SHALL report every numbered group heading that carries no
checkbox item. A group heading is a line matching `## <digits>.`, and it is
unexpanded when no `- [ ]` or `- [x]` item appears between it and the next group
heading. When at least one unexpanded group exists, `cover` SHALL exit with a
plan-incomplete code distinct from both the regression code and the usage-error
code, so a skill that branches on the exit code does not report an unexpanded
plan as a coverage regression.

The check SHALL apply only to a change-scoped run. A `--all` run scans the whole
`openspec/specs/` tree and has no single `tasks.md`, so it SHALL NOT perform this
check. That asymmetry means CI's `check-coverage-gate.mjs`, which runs `--all`,
never exercises the check, and unit tests are its only enforcement.

#### Scenario: A heading-only group blocks the run
- **WHEN** `cover <change-id>` runs against a change whose `tasks.md` has a
  `## 2. Baseline adoption` heading with no checkbox before the next group
  heading
- **THEN** cover names that group and exits with the plan-incomplete code

#### Scenario: A fully expanded plan passes the check
- **WHEN** every numbered group heading in the change's `tasks.md` carries at
  least one checkbox item
- **THEN** cover performs no plan-incomplete report and its exit code is decided
  by scenario coverage alone

#### Scenario: A prose heading is not a group heading
- **WHEN** `tasks.md` carries a `## Notes` heading, or a `### ` subheading, with
  no checkbox under it
- **THEN** cover does not treat it as an unexpanded group, because it does not
  match `## <digits>.`

#### Scenario: A change with no tasks.md is not blocked by this check
- **WHEN** `cover <change-id>` runs against a change whose `tasks.md` does not
  exist
- **THEN** cover performs no plan-incomplete report, because the missing artifact
  is `openspec status`'s concern rather than the coverage gate's

#### Scenario: An --all run skips the check
- **WHEN** `dod-guard cover --all` runs
- **THEN** cover reads no `tasks.md` and never exits with the plan-incomplete
  code

### Requirement: The task parser exposes group headings and their items

The `tasks.md` parser SHALL expose each numbered group heading together with the
checkbox items that fall under it, so a caller can tell an expanded group from an
unexpanded one. Parsing of individual checkbox items, their ids, their
`<!-- covers: -->` annotations, and their inline metadata SHALL be unchanged, and
a heading SHALL NOT be reported as a task item.

#### Scenario: Groups and items are reported together
- **WHEN** the parser reads a `tasks.md` with two group headings, the first
  carrying two items and the second carrying none
- **THEN** it reports two groups, the first with two items and the second with
  none, and reports exactly two task items overall

#### Scenario: Items above the first group heading still parse
- **WHEN** a `tasks.md` carries a checkbox item before any numbered group heading
- **THEN** the parser still reports that item as a task, and does not attribute
  it to a group


### Requirement: cover refuses a finished plan that names none of its scenarios

A change-scoped `dod-guard cover <change-id>` run SHALL exit with a plan-unbound
code, distinct from the regression, usage-error and plan-incomplete codes, when
all of the following hold:

- the run is change-scoped rather than `--all`
- the change's `tasks.md` exists and carries at least one numbered group
- every numbered group carries at least one checkbox item, so the
  plan-incomplete check did not fire
- the change's spec deltas yield at least one scenario
- no checkbox item carries a `covers:` annotation naming one of those scenarios

The report SHALL name the scenarios no task claimed, so the reader sees which
behavior the plan leaves out.

The check SHALL read the plan's own `covers:` annotations and SHALL NOT read
whether a test binds a scenario. A plan is written before the work exists, so
every scenario is `unwired` at that moment. A scenario with no test yet SHALL
NOT on its own trigger this code, or the check would refuse every correctly
planned change that has not been built.

The full-expansion condition keeps an early wave legal. A wave that builds
scaffolding may legitimately name no scenario, so only a plan with every group
expanded is judged. A change with no `tasks.md`, or one with no numbered group,
has no plan yet and SHALL NOT be judged.

Like the plan-incomplete check, this SHALL apply only to a change-scoped run. An
`--all` run scans the whole `openspec/specs/` tree and has no single `tasks.md`,
so it SHALL NOT perform this check.

#### Scenario: A finished plan naming nothing is refused
- **WHEN** `cover <change-id>` runs against a change whose `tasks.md` has every
  numbered group expanded, whose deltas carry a scenario, and whose items carry
  no `covers:` annotation for it
- **THEN** cover names that scenario and exits with the plan-unbound code

#### Scenario: A plan is judged on its own annotations, not on tests
- **WHEN** the change's single item carries a `covers:` annotation naming the
  change's scenario, and no test file binds that scenario yet
- **THEN** cover reports the scenario as unwired and still exits 0, because the
  plan named the work it will do

#### Scenario: An annotation naming a scenario the change does not have is not enough
- **WHEN** an item's `covers:` annotation names a scenario absent from the
  change's deltas
- **THEN** cover exits with the plan-unbound code, because no item named a
  scenario this change actually has

#### Scenario: Annotations that named nothing are reported with the expected format
- **WHEN** the plan carries `covers:` annotations that name none of the change's
  scenarios, for example because they omit the requirement and scenario titles
- **THEN** the report states how many annotations tasks.md carries and gives the
  expected annotation format, so the reader is not told they wrote none

#### Scenario: An unexpanded group is reported before an unannotated plan
- **WHEN** the change has an unexpanded group and no annotated item
- **THEN** cover exits with the plan-incomplete code rather than the
  plan-unbound code

#### Scenario: A change with no spec deltas is not refused
- **WHEN** `cover <change-id>` runs against a change whose deltas yield no
  scenario
- **THEN** cover reports that there is nothing to cover and does not exit with
  the plan-unbound code

#### Scenario: A change with no tasks.md is not judged
- **WHEN** `cover <change-id>` runs against a change whose deltas carry
  scenarios and whose `tasks.md` does not exist
- **THEN** cover does not exit with the plan-unbound code, because a change with
  no plan has not yet claimed to implement anything

#### Scenario: An --all run skips the check
- **WHEN** `dod-guard cover --all` runs
- **THEN** cover never exits with the plan-unbound code
