## 1. Openspec bookkeeping

- [x] 1.1 Delete `openspec/changes/add-scenario-coverage-and-retroactive-specs/`
      (superseded; recoverable from commit `702c921`)
- [x] 1.2 Rewrite this change's `proposal.md` and `design.md` to describe the
      proof-engine teardown and the coverage-gate rebuild
- [x] 1.3 Rewrite this change's own `tasks.md` (this file) to match the new
      sequencing
- [x] 1.4 Delete this change's `dod.md` and `dod.md.scenario-map.json` (no `dod`
      artifact survives this change)
- [x] 1.5 Rewrite `specs/dod-guard/steps-generation/spec.md` and
      `specs/dod-guard/change-scoped-skills/spec.md` (both still-unarchived ADDED
      capabilities of this change) for the task-bound, cover-based design
- [x] 1.6 Rewrite `specs/dod-guard/build-skill-openspec-integration/spec.md` to
      drop the DoD-tree-derived `steps` requirement, keeping the plan-home and
      no-step-session requirements
- [x] 1.7 Delete `specs/dod-guard/generation-from-spec/spec.md` from this
      change's deltas; the capability itself gets a `## REMOVED Requirements`
      delta written in step 2, once the deletion it describes has actually
      happened
- [x] 1.8 Add a `## REMOVED Requirements` delta for `dod-guard/trace-closure` in
      step 2, for the same reason

## 2. Delete the proof engine

- [x] 2.1 Delete `evaluate-proof.ts`, `fingerprint.ts`, `checker*.ts`,
      `import-gate.ts` and their tests. `buildShellInvocation`/`runCommand` were
      the one genuinely reusable piece (used by `fetch-instructions.ts`, needed
      by `cover` later) - extracted to `src/shell.ts` before the rest went
- [x] 2.2 Strip the DoD-tree-specific portions of `author.ts`, `parser.ts`,
      `tree-utils.ts`, `types.ts`, `schemas.ts`, `store.ts`; delete what serves no
      other caller. All of them served no other caller, so all deleted outright,
      along with `openspec/scenario-identity.ts`, `openspec/checkability.ts`,
      `command-check.ts`, `format-result.ts`, and `constants.ts` (each dead code
      once its one caller was gone)
- [x] 2.3 Delete `dod_create`, `dod_check`, `dod_refine`, `dod_add_node`,
      `dod_remove_node`, `dod_status`, `dod_tree`, `dod_amend`, `dod_list`,
      `dod_import`, `dod_generate`, `dod_store_migrate`, `dod_adversarial_gate`
      from `src/index.ts` (all 13)
- [x] 2.4 Delete the `check`, `status`, `tree`, `list`, `trace` CLI subcommands
      from `cli.ts`. `steps` deleted too rather than left half-working against a
      dead `trace.ts` import; task 4 rebuilds it against `tasks.md`
- [x] 2.5 Delete `scripts/ci/check-trace.mjs` and its `plugin-config` CI wiring
- [x] 2.6 Delete the schema's `dod` artifact and its templates from
      `openspec/schemas/dod-guard-spec-driven/schema.yaml`, and `dod` from
      `apply.requires`
- [x] 2.7 Write the deferred `## REMOVED Requirements` deltas for
      `dod-guard/generation-from-spec` and `dod-guard/trace-closure` (tasks 1.7,
      1.8), naming exactly what got deleted
- [x] 2.8 `npm run build -w packages/dod-guard && npm test -w packages/dod-guard`
      green with the engine gone (212 tests, 0 failures, after a clean rebuild -
      stale `dist/` from deleted `.ts` sources faked 71 failures on the first try)

## 3. Build `dod-guard cover`

Split at the reachability line: tasks 4.2 and 5.5 depend on `cover`'s output
contract and exit codes, not on its instrumentation, so 3a lands first and
unblocks steps 4-6 on its own. 3b (real reachability) is where the unknown
unknowns live and produces no signal until markers exist.

### 3a. Enumeration, marker binding, stubbed report, ratchet, CLI, CI

- [x] 3a.1 Scenario identity: `<group>/<capability>::<requirement>||<scenario>`,
      reusing `extractRequirementBlocks` from `src/openspec/requirements.ts`
      (no second parser)
- [x] 3a.2 Two enumeration modes: change-scoped (`openspec/changes/<id>/
      specs/**/spec.md`) and whole-tree (`--all`, `openspec/specs/**/spec.md`),
      same report shape, same baseline
- [x] 3a.3 Design and document the test-file marker format that binds a
      scenario to a named test; scan test files by regex, no execution
- [x] 3a.4 Design and document `openspec/entry-points.json`, keyed by package
      dir; a group with no mapping or no file reports unwired with a reason,
      not a crash
- [x] 3a.5 Three-outcome report with reachability stubbed: unbound scenario is
      unwired, bound scenario is covered-but-not-integrated (placeholder until
      3b)
- [x] 3a.6 Add the coverage-gate ratchet baseline (adopt-unseen,
      block-on-regression, mirroring `check-coverage.mjs`'s
      `readBaseline`/`writeBaseline`/`compare`)
- [x] 3a.7 Add `dod-guard cover [<change-id>] [--all] [--write-baseline]` to
      `cli.ts`, exit 0/1/3 matching the retired `check-trace.mjs` convention
- [x] 3a.8 Add `scripts/ci/check-coverage-gate.mjs` and wire it into
      `plugin-config` in place of the deleted `check-trace.mjs`
- [x] 3a.9 Write the `dod-guard/coverage-gate` capability spec delta

### 3b. Real reachability

- [x] 3b.1 Run a bound test in isolation via `--test-name-pattern`, under c8
      scoped to its package's `dist/**/*.js` (mirroring `check-coverage.mjs`'s
      `c8Args`)
- [x] 3b.2 Match the isolated run's per-file coverage against the package's
      declared entry-point files to decide covered-and-integrated vs
      covered-but-not-integrated
- [x] 3b.3 A failing bound test reports as failing, folded into "not covered"
      for the ratchet
- [x] 3b.4 Manual check: one real marker, one real entry-point declaration,
      confirm the outcome flips when the entry-point declaration is removed.
      Bound `cli.test.ts`'s `--help` test to `dod-guard/coverage-gate::cover
      reports a scenario's state||A marker binds a scenario to a test`:
      covered-and-integrated with `cli.ts` declared, covered-but-not-integrated
      with it removed. Both temporary edits reverted after confirming
- [ ] 3b.5 Give the ratchet a pawl: a "Tighten coverage-gate baseline" CI step
      (mirroring `quality-baseline.json`'s) that commits a scenario's
      improvement back, once 3b can produce covered-and-integrated at all -
      inert in 3a since nothing is covered yet, load-bearing once something is
- [ ] 3b.6 Detect a renamed requirement or scenario title: a scenario id in the
      baseline that no longer appears in the current run is an orphan.
      `compareToBaseline` only iterates current scenarios, so a rename today
      silently re-adopts the new id at whatever `cover` finds it - a
      covered-and-integrated scenario can drop to unwired with no regression
      reported, because the old and new ids never collide in the comparison

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
