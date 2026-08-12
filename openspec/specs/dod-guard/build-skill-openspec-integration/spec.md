# Build Skill OpenSpec Integration Specification

## Purpose

Points the `/interview`, `/step-by-step` and `/cheap-step` skills at OpenSpec
artifacts, so the primary build workflow reads and writes the same seam
`dod-generation-from-spec` and `dod-trace-closure` define, instead of
hand-written DoD prose.

## Requirements

### Requirement: interview writes an OpenSpec change

`/interview` Phase 4 SHALL write an OpenSpec change instead of calling
`dod_create` with prose sections, then SHALL generate the DoD from that
change.

#### Scenario: Interview reaches Phase 4
- **WHEN** an interview session completes its question rounds and reaches
  Phase 4
- **THEN** the skill writes a proposal and spec deltas under
  `openspec/changes/<id>/` instead of calling `dod_create`

### Requirement: interview keeps its question floors and adversarial review

`/interview` SHALL keep its minimum question count and its adversarial spec
review step, because OpenSpec provides neither.

#### Scenario: Interview session with few natural questions
- **WHEN** a topic would naturally produce fewer questions than the
  configured floor
- **THEN** the skill still asks up to the floor, and still runs the
  adversarial spec review before finishing

### Requirement: unconfirmed answers become open questions

A confirmed answer SHALL become a requirement or scenario. An unconfirmed
answer SHALL be written to the DoD's `open_questions` field.

#### Scenario: One answer stays unconfirmed
- **WHEN** an interview round ends with one answer the user has not
  confirmed
- **THEN** the generated DoD's `open_questions` field names that answer, and
  no requirement or scenario is written for it

### Requirement: questions carry a risk label and a per-round cap

Each clarifying question SHALL carry a risk label of Low, Medium or High,
and `/interview` SHALL ask at most 3 clarifying questions per round.

#### Scenario: Round would otherwise ask more than three questions
- **WHEN** more than 3 clarifying questions apply in one round
- **THEN** the skill asks at most 3 of them, each labeled Low, Medium or
  High, and defers the rest to a later round

### Requirement: handoff names opsx:apply as an executor

The handoff table `/interview` prints at the end of a session SHALL list
`/opsx:apply` as an executor option alongside `/step-by-step`.

#### Scenario: Interview session finishes
- **WHEN** an interview session completes and prints its handoff table
- **THEN** the table includes `/opsx:apply` as one of the listed executors

### Requirement: steps derive from the DoD as a schema artifact

The schema SHALL define a `steps` artifact with `requires: [dod]`. Its
converter SHALL turn each DoD leaf's proof command into a step's
`verify_cmd` and each leaf's intent into the step title.

#### Scenario: Steps artifact blocked before dod completes
- **WHEN** a change has not completed the `dod` artifact
- **THEN** `openspec status --json` reports the `steps` artifact blocked
  with `dod` in its `missingDeps`

#### Scenario: Leaf proof command becomes verify_cmd
- **WHEN** the `dod` artifact contains a leaf with a proof command
- **THEN** the generated `steps.json` contains one step whose `verify_cmd`
  is that proof command and whose title is the leaf's intent

### Requirement: draft leaves map to manual_required steps

A `MANUAL:` draft leaf SHALL map to a step with `manual_required: true`.

#### Scenario: DoD contains a draft leaf
- **WHEN** the `dod` artifact contains a leaf held at INCOMPLETE with a
  `MANUAL:` intent
- **THEN** the generated `steps.json` contains a matching step with
  `manual_required: true`

### Requirement: briefing carries the Requirement field

Each step briefing `/step-by-step` and `/cheap-step` produce SHALL include a
`Requirement` field carrying the scenario's `WHEN` and `THEN` lines
verbatim.

#### Scenario: Worker receives a step briefing
- **WHEN** a step's briefing is generated for a worker
- **THEN** the briefing contains a `Requirement` field with the source
  scenario's `WHEN` and `THEN` text unchanged

### Requirement: briefing states the assumption rule

Each step briefing SHALL instruct the worker that code depending on behavior
its scenario does not state gets an `ASSUMPTION: <what and why>` comment at
that line.

#### Scenario: Worker writes code beyond what the scenario states
- **WHEN** a worker's briefing is generated
- **THEN** the briefing text states the `ASSUMPTION:` comment rule

### Requirement: staleness check reads openspec status

`/step-by-step`'s staleness check SHALL key off `openspec status --json`
for a change-sourced plan, instead of comparing `plan_source` file mtimes.

#### Scenario: Underlying change gains a new commit
- **WHEN** the OpenSpec change backing an active session changes after the
  session started
- **THEN** the staleness check detects the change through
  `openspec status --json`, not through a file mtime comparison

### Requirement: opsx:propose is a recognized plan producer

`/step-by-step`'s callers list SHALL name a change proposed through
`/opsx:propose` as a plan producer, alongside its other listed callers.

#### Scenario: Session starts from an OpenSpec change
- **WHEN** `/step-by-step` is invoked with an OpenSpec change as its plan
  source
- **THEN** the skill recognizes it as a valid plan producer without error

### Requirement: commit lands after each verified step

`/step-by-step` and its `step-*` agents SHALL commit after each step passes
verification, not only write a commit message and stop.

#### Scenario: A step's verify_cmd passes
- **WHEN** a dispatched step's verification command exits zero
- **THEN** the orchestrator commits that step's changes before dispatching
  the next step

### Requirement: finishing traces and archives

On a green integration check, `/step-by-step`'s Finishing phase SHALL run
`dod-guard trace` and then `openspec archive <id> --yes`.

#### Scenario: Integration check passes at session end
- **WHEN** the final integration check of a session passes
- **THEN** Finishing runs `dod-guard trace` and, when it exits zero, runs
  `openspec archive <id> --yes`

### Requirement: cheap-step mirrors step-by-step

Every requirement above that describes `/step-by-step` SHALL also hold for
`/cheap-step`, which SHALL keep its own `mode` field alongside these
changes.

#### Scenario: cheap-step session runs to Finishing
- **WHEN** a `/cheap-step` session reaches Finishing under the same
  conditions as `/step-by-step`
- **THEN** it runs `dod-guard trace` and `openspec archive <id> --yes` the
  same way, and its briefing still carries a `mode` field

### Requirement: adversarial review reads the spec

Adversarial review agents dispatched by `/step-by-step` and `/cheap-step`
SHALL receive the change's spec deltas, not only the code diff.

#### Scenario: Adversarial review is dispatched
- **WHEN** an adversarial reviewer agent is dispatched during a session
- **THEN** its input includes the spec delta text for the requirement the
  step under review claims to satisfy
