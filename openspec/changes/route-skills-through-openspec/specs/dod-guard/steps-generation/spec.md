## Purpose

Derives an executable plan from a change's task list, so the step list and the
change's own checklist cannot disagree. One `tasks.md` item becomes one step,
carrying a bound test's run command where `dod-guard cover` already knows one.

## ADDED Requirements

### Requirement: steps subcommand writes the change's plan

`dod-guard steps <change-id>` SHALL read `tasks.md` for that change, build the
step array, and write `openspec/changes/<change-id>/steps.json`. It SHALL
resolve that path through the OpenSpec CLI rather than composing it from string
parts.

#### Scenario: A change with tasks gains a plan
- **WHEN** `dod-guard steps <change-id>` runs for a change whose `tasks.md` has
  at least one item
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a run that writes the file at the path OpenSpec resolved

#### Scenario: The plan carries its own staleness signal
- **WHEN** the command writes `steps.json`
- **THEN** the file holds `goal`, `cwd`, `plan_source` set to the change id, and
  `plan_artifacts` taken from `openspec status --json --change <id>`

### Requirement: a task binds to a scenario through an annotation

A `tasks.md` item SHALL name the scenario it satisfies with an HTML comment,
`<!-- covers: <group>/<capability> :: <requirement title> :: <scenario title> -->`,
on the line directly below the item's checkbox line. `dod-guard steps` SHALL
read that annotation to look up the scenario's `dod-guard cover` outcome,
rather than matching task text against scenario titles. An item with no
annotation has no scenario to look up, so it falls to the "an unbound task
becomes a manual step" requirement below.

#### Scenario: An annotated task resolves its bound test
- **WHEN** a `tasks.md` item carries a covers annotation naming a scenario
  that `dod-guard cover` reports as covered-and-integrated or
  covered-but-not-integrated
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a step whose `verify_cmd` is that scenario's bound test's
  run command

#### Scenario: An annotated task naming an unwired scenario stays manual
- **WHEN** a `tasks.md` item's annotation names a scenario `dod-guard cover`
  reports as unwired or failed
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a step with `manual_required` true

### Requirement: a task item becomes a verified step

Each `tasks.md` item SHALL produce one step whose `verify_cmd` is the run
command for that task's `dod-guard cover`-bound test, when one exists. Steps
SHALL keep source order, and each SHALL depend on the step immediately before
it.

#### Scenario: Tasks convert in order
- **WHEN** a change's `tasks.md` holds two sections of two items each
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering four steps in source order where each after the first names
  its predecessor in `deps`

### Requirement: an unbound task becomes a manual step

A task item with no `cover` binding yet SHALL produce a step with
`manual_required` true and an empty `verify_cmd`. The task's own text becomes
the step's description.

#### Scenario: A change mixes bound and unbound tasks
- **WHEN** `dod-guard steps <change-id>` runs against a `tasks.md` holding both
  kinds
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a manual step with `manual_required` true and an empty
  `verify_cmd`

### Requirement: fields a machine cannot know are left for judgment

The command SHALL emit `files` as an empty array and `verify_surface` as `code`
for every step, and every step SHALL start at status `pending`. The `steps`
artifact instruction SHALL tell the agent to fill `files` and `verify_surface`
afterwards.

#### Scenario: A generated step is inspected before editing
- **WHEN** the command writes a step
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a step whose `files` is empty, whose `verify_surface` is
  `code`, and whose `status` is `pending`

### Requirement: exit codes match the cover subcommand

`dod-guard steps` SHALL exit 0 when it writes the plan, and 3 when the change
has no `tasks.md` or the invocation is malformed.

#### Scenario: The change has no tasks
- **WHEN** `dod-guard steps <change-id>` runs against a change with no
  `tasks.md`
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering an exit code of 3
