## Purpose

Derives an executable plan from a change's registered Definition of Done, so
the step list and the proof tree cannot disagree. One concrete leaf becomes one
step carrying that leaf's own proof command.

## ADDED Requirements

### Requirement: steps subcommand writes the change's plan

`dod-guard steps <change-id>` SHALL read the DoD registered for that change,
build the step array, and write `openspec/changes/<change-id>/steps.json`. It
SHALL resolve that path through the OpenSpec CLI rather than composing it from
string parts.

#### Scenario: A change with a registered DoD gains a plan
- **WHEN** `dod-guard steps <change-id>` runs for a change whose DoD is
  registered
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a run that writes the file at the path OpenSpec resolved

#### Scenario: The plan carries its own staleness signal
- **WHEN** the command writes `steps.json`
- **THEN** the file holds `goal`, `cwd`, `plan_source` set to the change id,
  and `plan_artifacts` taken from `openspec status --json --change <id>`

### Requirement: a concrete leaf becomes a verified step

Each concrete leaf SHALL produce one step whose `verify_cmd` is that leaf's
proof command verbatim, with no wrapping in `dod-guard check`. Steps SHALL keep
source order, and each SHALL depend on the step immediately before it.

#### Scenario: Leaves convert in order
- **WHEN** a DoD holds two requirement groups of two concrete leaves each
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering four steps in source order where each after the first
  names its predecessor in `deps`

### Requirement: a MANUAL draft becomes a manual step

A draft leaf whose intent starts with `MANUAL:` SHALL produce a step with
`manual_required` true, an empty `verify_cmd`, and the intent minus that prefix
as its description. A draft leaf without the prefix SHALL produce no step.

#### Scenario: A DoD mixes concrete and manual leaves
- **WHEN** `dod-guard steps <change-id>` runs against a DoD holding both kinds
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a manual step with `manual_required` true and an empty
  `verify_cmd`

### Requirement: fields a machine cannot know are left for judgment

The command SHALL emit `files` as an empty array and `verify_surface` as
`code` for every step, and every step SHALL start at status `pending`. The
`steps` artifact instruction SHALL tell the agent to fill `files` and
`verify_surface` afterwards.

#### Scenario: A generated step is inspected before editing
- **WHEN** the command writes a step
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering a step whose `files` is empty, whose `verify_surface` is
  `code`, and whose `status` is `pending`

### Requirement: exit codes match the trace subcommand

`dod-guard steps` SHALL exit 0 when it writes the plan, and 3 when the change
has no registered DoD or the invocation is malformed.

#### Scenario: The change has no DoD
- **WHEN** `dod-guard steps <change-id>` runs against a change with no
  registered DoD
- **THEN** `node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/steps-cli.test.js`
  exits 0, covering an exit code of 3
