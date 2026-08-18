# dod-guard/opsx-continue Specification

## Purpose
Carries an OpenSpec change forward from whatever artifacts it already has to a
plan that can be implemented, creating each missing artifact in the schema's
build order. Plans large work in waves: every task group is named up front, and
one group at a time is expanded into checkboxes, so later detail is written with
what earlier implementation taught rather than guessed before it.
## Requirements
### Requirement: The skill advances the build frontier

`/opsx-continue` SHALL create a change's missing planning artifacts and SHALL
NOT edit implementation code. It SHALL read the artifact ids, their build order,
and their output paths from `openspec status --change <id> --json` rather than
assuming them, so a custom schema works unchanged. It SHALL create only
artifacts whose status is `ready`, and SHALL NOT create one whose status is
`skipped`.

#### Scenario: A change holding only a proposal
- **WHEN** `/opsx-continue` runs against a change whose `proposal.md` exists and
  whose specs, design, and tasks artifacts are absent
- **THEN** it creates each missing artifact in the order `openspec status`
  reports, reading each artifact's rules from `openspec instructions <artifact-id>
  --change <id> --json` first

#### Scenario: An artifact marked skipped stays absent
- **WHEN** the change's status reports an artifact with status `skipped`
- **THEN** the skill creates no file for that artifact and names it as skipped in
  its report

#### Scenario: A fully planned change needs nothing
- **WHEN** every planning artifact already exists
- **THEN** the skill writes no artifact and reports that the change is already
  planned, pointing at `/opsx-update` for revisions

### Requirement: Task groups are named before they are expanded

When the skill writes `tasks.md` it SHALL write a `## N. <group>` heading for
every unit of work the proposal and specs imply, including work it cannot yet
break down. It SHALL expand `- [ ]` checkbox items under the near wave only, and
SHALL leave later groups as headings with no checkboxes. The skill SHALL NOT
introduce a plan format beyond the `## N.` heading and `- [ ]` checkbox levels
that `tasks.md` already uses.

#### Scenario: First pass writes all headings and one expanded wave
- **WHEN** the skill writes `tasks.md` for a change with four units of work
- **THEN** the file carries four `## N.` group headings, and only the first
  group carries `- [ ]` items

#### Scenario: A checkbox binds to a scenario
- **WHEN** the skill expands a checkbox whose work maps to a spec scenario
- **THEN** the item carries a `<!-- covers: <group>/<capability> :: <requirement
  title> :: <scenario title> -->` annotation on the line after it

### Requirement: Re-invocation expands the next wave

`/opsx-continue` SHALL be re-invocable against the same change. On a later run it
SHALL leave every already-expanded group unchanged, including checked items, and
SHALL expand the next heading-only group. It SHALL read the implementation that
the expanded waves produced before writing the next wave's items, so the
breakdown reflects what was learned rather than the original guess.

#### Scenario: Second run expands the second group only
- **WHEN** the skill runs against a change whose first group is expanded and
  whose second, third, and fourth groups are heading-only
- **THEN** it adds `- [ ]` items under the second group and leaves the first
  group's items and their checked state untouched, and the third and fourth as
  headings

#### Scenario: Learning changes a later breakdown
- **WHEN** implementation of an expanded wave contradicts an assumption the
  proposal made about a later group
- **THEN** the skill reports the contradiction and asks the user before writing
  the next wave's items

#### Scenario: No unexpanded group remains
- **WHEN** every group heading already carries checkboxes
- **THEN** the skill writes no items and reports that the plan is fully expanded

### Requirement: The change is validated after each artifact

The skill SHALL run `openspec validate <id> --strict --no-interactive` after
writing an artifact, and SHALL fix the reported error and re-validate until it
passes.

#### Scenario: Validation fails after an artifact is written
- **WHEN** `openspec validate` reports an error after the skill writes an
  artifact
- **THEN** the skill repairs that artifact and re-runs validate rather than
  proceeding to the next artifact


### Requirement: A change never delivers a plan

`/opsx-continue` SHALL treat an OpenSpec change as the plan itself, whose
artifacts are the same change at increasing detail: the proposal is the draft,
the specs fix the behavior, the design fixes the approach, and `tasks.md` is
that change made executable.

A proposal that calls itself a planning pass, a refinement pass, or says it
produces a plan rather than an implementation, SHALL be read as a description
of the change's draft state, which `openspec status` already reports. The skill
SHALL NOT read it as a statement of what the change delivers.

The skill SHALL NOT write a checkbox item whose deliverable is a plan. When the
proposal lists planning documents among its required outputs, their content
SHALL be written into this run's own artifacts rather than deferred to a task.
A decision the run has already closed with the user SHALL NOT be re-opened as a
document for a later task to write.

#### Scenario: A proposal describing itself as a planning pass
- **WHEN** `/opsx-continue` expands `tasks.md` for a change whose proposal says
  it produces an implementation plan rather than the implementation
- **THEN** the items it writes build the behavior the change's spec deltas
  describe, and no item's deliverable is a plan document

#### Scenario: The proposal lists planning documents as outputs
- **WHEN** the proposal names a phased plan document and a locked contract
  document among the change's required outputs
- **THEN** the skill writes that content into the change's own design and task
  artifacts on this run, rather than writing an item that produces those
  documents later

#### Scenario: A decision closed this run is not re-opened
- **WHEN** the run has already resolved an open decision with the user before
  expanding `tasks.md`
- **THEN** no item asks a later worker to decide it again or to record it in a
  document

### Requirement: The wave implements the change's specs

Before writing a wave's checkbox items, `/opsx-continue` SHALL check them
against the change's scenarios. When the change's spec deltas carry at least one
scenario and no item in the wave names any of them, the skill SHALL stop,
SHALL report the scenario list together with the items it drafted, and SHALL ask
the user before writing the wave.

This applies to the wave taken as a whole. A single item that maps to no
scenario SHALL still carry no annotation, and SHALL NOT be given an invented one.

#### Scenario: A wave that names no scenario
- **WHEN** the change's deltas carry six scenarios and every item drafted for
  the wave names none of them
- **THEN** the skill reports the six scenarios and the drafted items, and asks
  the user rather than writing the wave

#### Scenario: A single unannotated item in an otherwise annotated wave
- **WHEN** a wave's items name scenarios except one that adds a dependency
- **THEN** that item carries no annotation and the wave is written without a
  stop

### Requirement: The skill's wording does not make a plan an output

The skill's own text SHALL NOT describe producing a plan as a deliverable of the
change. It SHALL name the act of filling in `tasks.md` as expanding it rather
than planning it, and SHALL describe a change with every artifact present as
complete rather than as planned.

Terms that name a field in `openspec status` output or an exit code SHALL keep
their exact spelling, because they identify an interface rather than describe
the work.

#### Scenario: Wording that names an interface is unchanged
- **WHEN** the skill refers to the `planningHome` field or to cover's
  plan-incomplete exit code
- **THEN** those names keep their spelling, because renaming them would break
  the reference
