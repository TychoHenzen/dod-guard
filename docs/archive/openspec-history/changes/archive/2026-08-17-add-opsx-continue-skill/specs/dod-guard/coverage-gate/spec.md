## ADDED Requirements

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
