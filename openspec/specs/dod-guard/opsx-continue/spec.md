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

