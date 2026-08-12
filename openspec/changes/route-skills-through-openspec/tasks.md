## 1. Openspec bookkeeping

- [x] 1.1 Delete `openspec/changes/add-scenario-coverage-and-retroactive-specs/`
      (superseded; recoverable from commit `702c921`)
- [x] 1.2 Rewrite this change's `proposal.md` and `design.md` to describe the
      proof-engine teardown and the coverage-gate rebuild
- [x] 1.3 Rewrite this change's own `tasks.md` (this file) to match the new
      sequencing
- [ ] 1.4 Delete this change's `dod.md` and `dod.md.scenario-map.json` (no `dod`
      artifact survives this change)
- [ ] 1.5 Rewrite `specs/dod-guard/steps-generation/spec.md` and
      `specs/dod-guard/change-scoped-skills/spec.md` (both still-unarchived ADDED
      capabilities of this change) for the task-bound, cover-based design
- [ ] 1.6 Rewrite `specs/dod-guard/build-skill-openspec-integration/spec.md` to
      drop the DoD-tree-derived `steps` requirement, keeping the plan-home and
      no-step-session requirements
- [ ] 1.7 Delete `specs/dod-guard/generation-from-spec/spec.md` from this
      change's deltas; the capability itself gets a `## REMOVED Requirements`
      delta written in step 2, once the deletion it describes has actually
      happened
- [ ] 1.8 Add a `## REMOVED Requirements` delta for `dod-guard/trace-closure` in
      step 2, for the same reason

## 2. Delete the proof engine

- [ ] 2.1 Delete `evaluate-proof.ts`, `fingerprint.ts`, `checker*.ts`,
      `import-gate.ts` and their tests
- [ ] 2.2 Strip the DoD-tree-specific portions of `author.ts`, `parser.ts`,
      `tree-utils.ts`, `types.ts`, `schemas.ts`, `store.ts`; delete what serves no
      other caller
- [ ] 2.3 Delete `dod_create`, `dod_check`, `dod_refine`, `dod_add_node`,
      `dod_remove_node`, `dod_status`, `dod_tree`, `dod_amend`, `dod_list`,
      `dod_import`, `dod_store_migrate`, `dod_adversarial_gate` from
      `src/index.ts`
- [ ] 2.4 Delete the `check`, `status`, `tree`, `list`, `trace` CLI subcommands
      from `cli.ts`
- [ ] 2.5 Delete `scripts/ci/check-trace.mjs` and its `plugin-config` CI wiring
- [ ] 2.6 Delete the schema's `dod` artifact and its templates from
      `openspec/schemas/dod-guard-spec-driven/schema.yaml`
- [ ] 2.7 Write the deferred `## REMOVED Requirements` deltas for
      `dod-guard/generation-from-spec` and `dod-guard/trace-closure` (tasks 1.7,
      1.8), naming exactly what got deleted
- [ ] 2.8 `npm run build -w packages/dod-guard && npm test -w packages/dod-guard`
      green with the engine gone

## 3. Build `dod-guard cover`

- [ ] 3.1 Design and document the test-file marker format that binds a scenario
      to a named test
- [ ] 3.2 Design and document the entry-point declaration file
- [ ] 3.3 Implement coverage-instrumented reachability: bound test ran and
      passed, and execution reached the scenario's implementation through a
      declared entry point
- [ ] 3.4 Implement the three-outcome report: covered-and-integrated,
      covered-but-not-integrated, unwired
- [ ] 3.5 Add `dod-guard cover <change-id>` to `cli.ts`
- [ ] 3.6 Add the coverage ratchet baseline (adopt-unseen, block-on-regression,
      mirroring `quality-baseline.json`)
- [ ] 3.7 Add the CI gate script and wire it into `plugin-config` in place of
      the deleted `check-trace.mjs`
- [ ] 3.8 Write the `dod-guard/coverage-gate` capability spec delta

## 4. Rework `steps`

- [ ] 4.1 Derive `steps.json` from `tasks.md` items instead of DoD leaves
- [ ] 4.2 Build `verify_cmd` from a task's `cover`-bound test where one exists;
      `manual_required: true` where it doesn't
- [ ] 4.3 Update `dod-guard/build-skill-openspec-integration`'s spec delta for
      the reworked `steps` behavior

## 5. Skills

- [ ] 5.1 Rewrite `/interview`: drop the DoD authoring policy, the `dod_create`
      fallback, the `docs/plans/` path; add scenario-writing and test-binding
      guidance
- [ ] 5.2 Point `/step-by-step` at `openspec/changes/<id>/steps.json`, delete
      `.step-session/`, `progress.log`, plan-file sessions, the mtime staleness
      branch
- [ ] 5.3 Strip `/cheap-step`'s `.step-session` and `progress.log` references
- [ ] 5.4 Move `/quality-refactor` onto a change with `skip_specs: true`, waves
      into `tasks.md`, plan into the change's `steps.json`, judgment into
      `design.md`
- [ ] 5.5 Give `/ratchet` a change id; close on `dod-guard cover` reporting zero
      regressions, then `openspec archive`
- [ ] 5.6 Give `/adversarial-workflow` a change id; move its four GO/REVISE/STOP
      verdicts into `design.md`; close on cover then archive
- [ ] 5.7 Make `/blind-rewrite` write the code contract as the change's spec
      delta before deletion, leave only quarantine in `.blind/`
- [ ] 5.8 Make each `/tighten` target open a change; reduce the ledger to a
      scanner queue closing on the target's change archiving
- [ ] 5.9 Drop the `dod_create` reference from `/test-integrity-checker`
- [ ] 5.10 Drop dod-guard tool-name references from `/clean-house`
- [ ] 5.11 Update `check-skill-hygiene.mjs`'s rule set for the new vocabulary;
      retire rules that policed the deleted predicate tables and `dod_create`
      fallback

## 6. Docs and cleanup

- [ ] 6.1 Remove `.step-session/` from `.gitignore`, `scripts/ci/lib/fs-utils.mjs`,
      `quality-refactor/scripts/lib/config.mjs`
- [ ] 6.2 Update `packages/dod-guard/README.md`, `USAGE.md`, `CLAUDE.md`; delete
      the DoD markdown format spec and predicate reference under `docs/`; fold
      `docs/shortcomings.md`'s findings into this change's own Context instead
      of leaving it describing a system that no longer exists
- [ ] 6.3 Update the root `CLAUDE.md` CLI table, gate table, Ratchets table, and
      the `evomcp -> dod-guard` cross-package example command
