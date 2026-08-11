## Why

OpenSpec now owns intent in this repo (proposals, specs, changes). dod-guard
still owns proof (DoD trees, fingerprints, verdicts). Nothing ties one
scenario to one proof today. A DoD can drift from the spec it should
prove, or prove something no spec asked for. This change builds that seam
and points the build skills at it.

## What Changes

- Add a `dod` schema artifact that generates a DoD document from a change's
  spec deltas, so the DoD is never hand-written twice.
- Add `dod-guard trace <change-id>`, a closure check that fails when a DoD
  leaf has no matching scenario. It also reports, without failing, a
  scenario with no matching leaf and no `MANUAL:` draft.
- **BREAKING**: `/interview` Phase 4 stops calling `dod_create` with prose
  sections. It writes an OpenSpec change and generates the DoD from it
  instead.
- Rework `/step-by-step` and `/cheap-step` to read a `steps.json` schema
  artifact derived from DoD leaves. Add a `Requirement` briefing field
  naming the scenario a step proves. Commit after each verified step.
  Both skills also run `dod-guard trace` then `openspec archive` at
  Finishing. `/cheap-step` mirrors every one of these changes.
- Add an `ASSUMPTION: <what and why>` code comment convention for guesses
  that are not backed by a scenario, and a new `assumption-marker`
  quality-guard rule that counts (never fails) those comments. An audit
  reviews each hit for a verdict.

## Capabilities

### New Capabilities
- `dod-generation-from-spec`: converts an OpenSpec change's spec deltas into
  a DoD document, one scenario mapping to one leaf. An uncheckable scenario
  gets one `MANUAL:` draft leaf instead. The document registers through
  `dod_import`.
- `dod-trace-closure`: `dod-guard trace <change-id>`, the two-directional
  check that every DoD leaf traces to a scenario and every scenario reaches
  a leaf or a draft.
- `build-skill-openspec-integration`: the observable behavior of
  `/interview`, `/step-by-step` and `/cheap-step` once they read from and
  write to OpenSpec artifacts instead of hand-written DoD prose.
- `assumption-marker-audit`: the `ASSUMPTION:` comment convention, the
  quality-guard rule that counts it, and the audit that resolves each hit.

### Modified Capabilities
(none - this repo has no prior specs. Every capability above is new)

## Impact

- `openspec/schemas/<name>/schema.yaml` and its `templates/` folder (new
  `dod` and `steps` artifacts).
- `packages/dod-guard/src/cli.ts` (new `trace` subcommand).
- `packages/dod-guard/src/types.ts` (open_questions field, already present,
  now populated from OpenSpec's unconfirmed answers).
- `skills/interview/SKILL.md`, `skills/step-by-step/SKILL.md`,
  `skills/cheap-step/SKILL.md`, and the `step-*` agent definitions.
- `packages/quality-guard/skills/quality-refactor/scripts/lib/violations.mjs`
  and `.github/quality/quality-baseline.json` (new `assumption-marker` rule,
  rebaselined in the same commit).
- `CLAUDE.md` (CI gate table gains `dod-guard trace`).
