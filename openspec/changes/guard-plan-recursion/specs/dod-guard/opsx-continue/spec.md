## ADDED Requirements

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
scenario and no item in the wave binds to any of them, the skill SHALL stop,
SHALL report the scenario list together with the items it drafted, and SHALL ask
the user before writing the wave.

This applies to the wave taken as a whole. A single item that maps to no
scenario SHALL still carry no annotation, and SHALL NOT be given an invented one.

#### Scenario: A wave that binds no scenario
- **WHEN** the change's deltas carry six scenarios and every item drafted for
  the wave maps to none of them
- **THEN** the skill reports the six scenarios and the drafted items, and asks
  the user rather than writing the wave

#### Scenario: A single unbound item in an otherwise bound wave
- **WHEN** a wave's items bind to scenarios except one that adds a dependency
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
