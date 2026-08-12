## Why

This change started as a de-duplication pass: dod-guard's skills re-teach rules
that already live in the OpenSpec schema and converter. `/interview` restated the
DoD predicate and category tables, `/step-by-step` read a gitignored
`.step-session/steps.json` instead of the schema's `openspec/changes/<id>/steps.json`,
four skills still named the retired `dod_create` fallback, and `/ratchet`,
`/tighten`, and `/adversarial-workflow` didn't scope to a change id at all.

A census taken alongside that work read the DoD store directly: 37 documents, 969
leaves, 750 concrete leaves that last passed. Of those, 430 only prove a string
exists in a file, and 153 re-run a command CI runs anyway - 78 percent of the
passing proofs told nobody anything new. `packages/dod-guard/docs/shortcomings.md`
named the cause: the agent under test also authors the command, the predicate, and
the threshold that grades it. Tamper detection catches an out-of-band edit to the
store; it does not catch `dod_amend` legitimately weakening a proof the same agent
wrote, because the fingerprint follows the weakened value automatically. Ten
findings in that document trace back to the same root: self-certification, not
tamper-proofing, was ever the gap.

De-duplicating the skills against a proof engine with that defect fixes the wrong
layer. The engine itself - predicates, proof commands, the DoD tree, fingerprint
and tamper detection, `dod.md` - gets deleted. What replaces it: a scenario in
`openspec/specs/*/spec.md` counts as done when a named test, bound to it through a
marker in the test file itself, exercises it through a project-declared entry
point. `dod-guard cover <change-id>` is that check. It becomes the gate
`dod-guard check` and `dod-guard trace` used to be.

## What Changes

- Delete the predicate/proof/checker/fingerprint engine and all 13 of
  dod-guard's MCP tools (every one that authors, refines, generates, or checks
  a proof node). Delete the `check`, `status`, `tree`, `list`, and `trace` CLI
  subcommands and `scripts/ci/check-trace.mjs`. Delete the schema's `dod`
  artifact.
- **BREAKING**: no dod.md, no proof commands, no predicates, no fingerprint. A
  DoD document is no longer a thing dod-guard produces.
- Build `dod-guard cover <change-id>`: binds a scenario to a named test via a
  marker in the test file, runs the bound tests under instrumentation, and reports
  covered-and-integrated, covered-but-not-integrated (a test reaches the code
  without passing through a declared entry point - the integration-skipping case),
  or unwired. It is a blocking CI gate, ratcheted the way `quality-baseline.json`
  and `coverage-baseline.json` already are elsewhere in this repo: a scenario the
  baseline has never seen is adopted at its current state, and a regression on one
  it already marked covered is what blocks.
- Rework `dod-guard steps <change-id>` to derive one step per `tasks.md` item
  instead of per DoD leaf, with `verify_cmd` built from that task's bound test
  where one exists and `manual_required: true` where it doesn't yet.
- **BREAKING**: `/step-by-step` and `/cheap-step` read and write
  `openspec/changes/<id>/steps.json` only. `.step-session/` is deleted, along with
  `progress.log`, plan-file sessions, and the mtime staleness branch. Every run
  needs a change id.
- **BREAKING**: `/interview` drops the DoD authoring policy, the `dod_create`
  fallback, and the `docs/plans/` path. It helps write scenarios into the spec
  delta and mark the test binding and entry point `cover` needs.
- Point `/ratchet`, `/adversarial-workflow`, `/blind-rewrite`, and `/tighten` at a
  change id. Each finishes on `dod-guard cover` reporting zero regressions, then
  `openspec archive`, the same gate `/step-by-step` uses. `dod_adversarial_gate`
  is deleted; `/adversarial-workflow` records its GO/REVISE/STOP verdicts in the
  change's `design.md` instead.
- `/quality-refactor` opens a change with `skip_specs: true`, writes its waves to
  `tasks.md` and its plan to the change's `steps.json` (unchanged from the
  original plan - this part never depended on the proof engine).
- `/test-integrity-checker` and `/clean-house` drop their `dod_create` references.

## Capabilities

### New Capabilities

- `dod-guard/coverage-gate`: `dod-guard cover <change-id>` binds a scenario to a
  named test through a test-file marker, judges reachability through a declared
  entry point, and gates CI on regressions against a ratcheted baseline.
- `dod-guard/change-scoped-skills`: the observable behavior of `/ratchet`,
  `/adversarial-workflow`, `/blind-rewrite`, and `/tighten` once each takes a
  change id, writes its artifacts to that change, and closes on the cover-then-
  archive gate.
- `quality-guard/refactor-planning`: the change `/quality-refactor` opens for a
  refactor pass, and where its waves, judgment, and step plan land (unchanged
  from the original scope of this proposal).

### Modified Capabilities

- `dod-guard/build-skill-openspec-integration`: the executable plan lives at
  `openspec/changes/<id>/steps.json` and nowhere else, `steps` derives from
  `tasks.md` rather than a DoD tree, and `/interview` fetches scenario-writing
  guidance at run time instead of carrying its own copy.

### Removed Capabilities

- `dod-guard/generation-from-spec`: `dod_generate` and the DoD authoring policy
  it produced no longer exist. Superseded by `dod-guard/coverage-gate`, which
  needs no generated document.
- `dod-guard/trace-closure`: `dod-guard trace` and leaf-to-scenario closure no
  longer exist. Superseded by `dod-guard/coverage-gate`.

## Impact

- `packages/dod-guard/src/`: delete `evaluate-proof.ts`, `fingerprint.ts`,
  `checker*.ts`, `import-gate.ts`, the DoD-tree-specific parts of `author.ts`,
  `parser.ts`, `tree-utils.ts`, `types.ts`, `schemas.ts`, `store.ts`, and their
  tests. Delete all 13 MCP tools from `index.ts`. Rework `src/openspec/steps.ts` and
  add `src/cover/` (new).
- `openspec/schemas/dod-guard-spec-driven/schema.yaml`: drop the `dod` artifact
  and its templates.
- `scripts/ci/check-trace.mjs` deleted; a coverage gate script added in its place
  in the `plugin-config` job.
- Skills: `interview`, `step-by-step`, `cheap-step`, `ratchet`,
  `adversarial-workflow`, `blind-rewrite`, `tighten`, `test-integrity-checker`,
  `clean-house` under `packages/dod-guard/skills/`, and `quality-refactor` under
  `packages/quality-guard/skills/`.
- `scripts/ci/check-skill-hygiene.mjs` and its rule set updated to the new
  vocabulary; rules that policed the now-deleted predicate tables and
  `dod_create` fallback are retired along with what they guarded against.
- `.gitignore` loses `.step-session/`.
- `packages/dod-guard/README.md`, `USAGE.md`, `CLAUDE.md`, `docs/` (the DoD
  markdown format spec and predicate reference are deleted), plus the root
  `CLAUDE.md` CLI table, gate table, and Ratchets table.
- Any `.step-session/` session in flight when this lands is lost. Every DoD
  document in `~/.claude/dod-store/` becomes unreadable by any shipped tool;
  that store is a local, untracked directory, so nothing in the repo migrates it.
