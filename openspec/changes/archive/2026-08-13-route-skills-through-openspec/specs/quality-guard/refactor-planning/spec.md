## Purpose

Defines the change `/quality-refactor` opens for a refactor pass, and where its
waves, its judgment and its step plan land. A refactor changes no behavior, so
it declares no capability and still produces an executable plan.

## ADDED Requirements

### Requirement: a refactor pass opens a change

`/quality-refactor` SHALL open an OpenSpec change before it plans, and SHALL
set `skip_specs: true` in that change's `.openspec.yaml`. It SHALL NOT invent a
requirement in order to satisfy validation.

#### Scenario: A refactor pass starts
- **WHEN** the skill finishes its scan and begins planning
- **THEN** a change exists whose `.openspec.yaml` sets `skip_specs: true`

#### Scenario: The change validates with no deltas
- **WHEN** the change carries no spec delta
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=refactor-skip-specs`
  exits 0, having found the skill setting `skip_specs: true`

### Requirement: the plan lands in the change

`/quality-refactor` SHALL write its waves to `openspec/changes/<id>/tasks.md`
and its step plan to `openspec/changes/<id>/steps.json`. Its public-API and
file-layout judgment SHALL land in that change's `design.md`.

#### Scenario: The skill emits its plan
- **WHEN** planning completes
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session`
  exits 0, and the skill names the change directory as the home for both files

#### Scenario: The scanner cache stays out of the change
- **WHEN** the skill writes `.quality/units.json`
- **THEN** that file remains regenerable scanner output and is not treated as
  the plan

### Requirement: the skill carries no copy of the steps shape

`/quality-refactor` SHALL NOT restate the `steps.json` field list. It SHALL
point at `openspec instructions steps --change <id>` instead.

#### Scenario: The skill describes what to emit
- **WHEN** the skill tells the agent to write the step plan
- **THEN** `node scripts/ci/check-skill-hygiene.mjs --rule=no-authoring-copy`
  exits 0
