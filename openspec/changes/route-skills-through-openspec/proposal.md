## Why

The OpenSpec migration landed on the code side and stalled on the skill side.
The schema declares `dod` and `steps` as artifacts of a change,
`openspec instructions <artifact> --change <id>` returns their authoring rules,
and `packages/dod-guard/src/openspec/` holds the converter, the trace check and
a steps builder. The skills were written when each of them was its own system
of record. They still are, so every rule now exists twice.

Two homes hold one plan. The schema generates
`openspec/changes/<id>/steps.json`. `/step-by-step` reads
`.step-session/steps.json`, which is gitignored. The shipped spec
`dod-guard/build-skill-openspec-integration` says the steps artifact comes from
the schema, so the shipped skill contradicts the shipped spec. The active change
`add-scenario-coverage-and-retroactive-specs` already carries a `steps.json`
that the executor would never open.

The steps shape is specified in four places: the schema template,
`/step-by-step`'s Persistence section, `/quality-refactor`'s Phase 3 literal,
and `src/openspec/steps.ts`. They have already drifted. `/quality-refactor` sets
`plan_source` to a file path where the schema defines it as a change id, and it
omits `plan_artifacts`, which is the staleness signal.

`/interview` re-teaches OpenSpec. Its section 5 restates the spec delta format
that `openspec instructions specs` prints, and carries about 130 lines of DoD
authoring policy. That policy belongs in the `dod` artifact instruction, which
today reads `Placeholder instruction. The dod artifact's template and
generation workflow land in a later migration step.`

Stale fallbacks survive alongside it. `/interview` claims `dod_generate` is not
reachable in the deployed plugin and keeps a `dod_create` path writing to
`docs/plans/`. dod-guard 3.0.0 ships `dod_generate`. `/ratchet` and
`/adversarial-workflow` still describe `/interview` as calling `dod_create`, and
neither knows what a change id is. `/tighten` runs a whole propose-to-archive
lifecycle inside `.tighten/ledger.json` without one openspec command.

Repairing these one sentence at a time leaves five copies of every rule, and
they drift again. One ownership rule applied everywhere, with the copies
deleted, is the fix.

## What Changes

- Fill the schema's `dod` artifact instruction with the DoD authoring policy
  that `/interview` carries today: the predicate and category tables, the
  company baseline, the integration proof pair, the `MANUAL:` inspection leaf
  triggers, and the test-first leaf pair.
- **BREAKING**: change the `steps` artifact's `requires` from `dod` to `tasks`,
  so a change with no spec deltas can still produce an executable plan.
- Add `dod-guard steps <change-id>`, which derives `steps.json` from the
  change's registered DoD and gives `src/openspec/steps.ts` its first caller.
- Fix two converter fidelity defects the dogfood run exposed. A requirement
  under `## REMOVED Requirements` currently becomes a draft node, so deleted
  behavior turns into a proof obligation nobody can ever satisfy.
- Fix the leaf title round trip. `author.ts` does not render a concrete leaf's
  title, so `parser.ts` substitutes the THEN text, and `amendChangedLeaf` never
  refreshes it. A regenerated leaf therefore keeps text from a scenario version
  that no longer exists, and `dodTreeToSteps` reads exactly that field into the
  step title.
- **BREAKING**: `/step-by-step` and `/cheap-step` read and write
  `openspec/changes/<id>/steps.json` only. `.step-session/` is deleted, along
  with `progress.log`, plan-file sessions, and the mtime staleness branch. Every
  run needs a change id.
- **BREAKING**: `/interview` drops the `dod_create` fallback, the `docs/plans/`
  path, and its copy of the DoD authoring policy. It fetches that policy from
  `openspec instructions dod --change <id>` at run time.
- Point `/ratchet`, `/adversarial-workflow`, `/blind-rewrite` and `/tighten` at
  a change id. Each finishes on the same `dod-guard trace` then
  `openspec archive` gate `/step-by-step` uses.
- `/quality-refactor` opens a change with `skip_specs: true`, writes its waves
  to `tasks.md` and its plan to the change's `steps.json`.

The predicate surface does not change. No proof, fingerprint or verdict
behavior changes.

## Capabilities

### New Capabilities

- `dod-guard/steps-generation`: `dod-guard steps <change-id>` derives an
  executable plan from a change's registered DoD. One concrete leaf becomes one
  step carrying that leaf's proof command, and one `MANUAL:` draft leaf becomes
  a step a human must confirm.
- `dod-guard/change-scoped-skills`: the observable behavior of `/ratchet`,
  `/adversarial-workflow`, `/blind-rewrite` and `/tighten` once each takes a
  change id, writes its artifacts to that change, and closes on the trace and
  archive gate.
- `quality-guard/refactor-planning`: the change `/quality-refactor` opens for a
  refactor pass, and where its waves, judgment and step plan land.

### Modified Capabilities

- `dod-guard/generation-from-spec`: the `dod` artifact instruction gains the
  authoring policy a generated DoD is amended against, so no skill carries a
  second copy. The converter also learns the delta operation headings, so a
  removed requirement produces no proof. A concrete leaf also keeps its
  scenario heading through the render and parse round trip, and a regeneration
  refreshes it.
- `dod-guard/build-skill-openspec-integration`: the executable plan lives at
  `openspec/changes/<id>/steps.json` and nowhere else, the `steps` artifact
  depends on `tasks` rather than `dod`, and `/interview` fetches artifact rules
  at run time.

## Impact

- `openspec/schemas/dod-guard-spec-driven/schema.yaml` and its
  `templates/steps.json`.
- `packages/dod-guard/src/cli.ts` (new `steps` subcommand),
  `src/openspec/fetch-instructions.ts` (artifact id becomes a parameter),
  `src/openspec/steps.ts` (gains a caller).
- `packages/dod-guard/src/openspec/requirements.ts` (delta operation headings).
- `packages/dod-guard/src/author.ts` and `src/parser.ts` (a concrete leaf's
  title is rendered and read back), `src/openspec/regenerate-dod.ts` and
  `src/tools/` (amend carries a new title), and the DoD markdown format spec
  under `packages/dod-guard/docs/`.
- Skills: `interview`, `step-by-step`, `cheap-step`, `ratchet`,
  `adversarial-workflow`, `blind-rewrite`, `tighten` under
  `packages/dod-guard/skills/`, and `quality-refactor` under
  `packages/quality-guard/skills/`.
- `.gitignore` loses `.step-session/`.
- `packages/dod-guard/README.md`, `USAGE.md` and `CLAUDE.md`, plus the root
  `CLAUDE.md` CLI and gate tables.
- Any `.step-session/` session in flight when this lands is lost.
