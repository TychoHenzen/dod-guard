## ADDED Requirements

### Requirement: A coverage regression outranks the plan checks in the exit code

When a change-scoped `dod-guard cover <change-id>` run finds at least one
scenario whose outcome regressed against the baseline, it SHALL exit with the
regression code, even when a plan check would also have fired.

A regression and a plan complaint describe different failures. A plan check
reports on a document that is still being written. A regression reports that
shipped behavior stopped being covered. A caller that branches on the exit code
SHALL be told about the regression, because it is the condition that names lost
coverage.

Both plan checks SHALL still run on the regression path, and SHALL still write
their reports, so no diagnostic output is lost. Only the returned code is
governed by this requirement.

This SHALL NOT change the precedence the plan checks hold relative to each
other. When no regression exists, an unexpanded group is still reported before
an unannotated plan.

#### Scenario: A regression alongside an unexpanded group
- **WHEN** `cover <change-id>` runs against a change that has a regressed
  scenario and a numbered task group carrying no items
- **THEN** cover exits with the regression code, and the report names both the
  regressed scenario and the unexpanded group

#### Scenario: A regression alongside an unbound plan
- **WHEN** `cover <change-id>` runs against a change that has a regressed
  scenario and a fully expanded plan naming none of its scenarios
- **THEN** cover exits with the regression code, and the report names both the
  regressed scenario and the unnamed scenarios

#### Scenario: The plan checks keep their order when nothing regressed
- **WHEN** a run finds no regression, and the change has both an unexpanded
  group and no annotated item
- **THEN** cover exits with the plan-incomplete code, unchanged from before

#### Scenario: A regression on its own is unaffected
- **WHEN** a run finds a regression and neither plan check fires
- **THEN** cover exits with the regression code
