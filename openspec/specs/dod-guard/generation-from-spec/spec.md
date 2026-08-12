# DoD Generation From Spec Specification

## Purpose

Generates a DoD document from an OpenSpec change's spec deltas. A proof
tree is derived from the accepted requirements instead of written by hand a
second time.

## Requirements

### Requirement: DoD artifact in the schema

The schema SHALL define a `dod` artifact with output path `dod.md` and a
`requires` list naming the `specs` artifact.

#### Scenario: Change reaches the dod artifact only after specs
- **WHEN** a change has completed the `proposal` and `specs` artifacts
- **THEN** `openspec status --json` reports the `dod` artifact as not
  blocked

#### Scenario: Change without specs cannot start the dod artifact
- **WHEN** a change has not completed the `specs` artifact
- **THEN** `openspec status --json` reports the `dod` artifact blocked with
  `specs` in its `missingDeps`

### Requirement: DoD generated from spec deltas

The converter SHALL read `openspec instructions dod --change <id> --json`
and SHALL produce a DoD markdown document in the format
`packages/dod-guard/src/parser.ts` parses.

#### Scenario: One scenario becomes one leaf
- **WHEN** a spec delta adds one requirement with one scenario
- **THEN** the generated DoD contains one leaf under that requirement's
  heading, with the scenario's `THEN` line as the leaf intent

#### Scenario: Leaves group under their requirement
- **WHEN** a spec delta adds one requirement with two scenarios
- **THEN** the generated DoD groups both leaves under that one requirement
  heading

### Requirement: Uncheckable scenario becomes a draft leaf

A scenario with no command that can verify it SHALL become a draft leaf
carrying a `MANUAL:` intent, held at the INCOMPLETE verdict.

#### Scenario: Scenario needs human judgment
- **WHEN** a scenario's outcome cannot be checked by any command (for
  example, a review of prose clarity)
- **THEN** the generated DoD marks that leaf as a draft with a `MANUAL:`
  intent, and the leaf's verdict is INCOMPLETE

### Requirement: Generated DoD registers through dod_import

The generated `dod.md` file SHALL be written to
`openspec/changes/<id>/dod.md` and SHALL be registered with the `dod_import`
tool, taking `{ path, cwd }`.

#### Scenario: Import reports the right leaf count
- **WHEN** `dod_import` is called with the generated `dod.md` path
- **THEN** it reports the same leaf count as scenarios and drafts in the
  spec deltas that produced it

### Requirement: Regenerated DoD preserves the tamper fingerprint

When a spec delta changes after a DoD was already generated, regenerating
the DoD SHALL rewrite only the leaves whose scenarios changed. It MUST NOT
weaken or bypass the existing tamper fingerprint on unchanged leaves.

#### Scenario: Spec edited after first generation
- **WHEN** a spec delta's scenario text changes after `dod.md` was generated
  and imported once already
- **THEN** regenerating and re-importing the DoD updates only the leaves
  tied to the changed scenario, and leaves the fingerprint on every
  untouched leaf intact
