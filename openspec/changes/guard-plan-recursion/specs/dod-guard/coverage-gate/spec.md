## ADDED Requirements

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
