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
      change's deltas. The capability itself gets a `## REMOVED Requirements`
      delta once the deletion it describes actually happens, written where
      the proof engine gets deleted below
- [x] 1.8 Add a `## REMOVED Requirements` delta for `dod-guard/trace-closure`
      too, written in that same pass, for the same reason

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
      dead `trace.ts` import. The steps rebuild below reads `tasks.md` instead
- [x] 2.5 Delete `scripts/ci/check-trace.mjs` and its `plugin-config` CI wiring
- [x] 2.6 Delete the schema's `dod` artifact and its templates from
      `openspec/schemas/dod-guard-spec-driven/schema.yaml`, and `dod` from
      `apply.requires`
- [x] 2.7 Write the deferred `## REMOVED Requirements` deltas for
      `dod-guard/generation-from-spec` and `dod-guard/trace-closure` (tasks 1.7,
      1.8), naming exactly what got deleted
- [x] 2.8 `npm run build -w packages/dod-guard && npm test -w packages/dod-guard`
      ran green with the engine gone, 212 tests and 0 failures, after a
      clean rebuild. Stale `dist/` output from deleted `.ts` sources had
      faked 71 failures on the first try

## 3. Build `dod-guard cover`

This work splits at the reachability line. The steps-rebuild and the
`/ratchet` closing gate depend on `cover`'s output contract and exit codes,
not on its instrumentation. So the enumeration-and-report half lands first
and unblocks everything after it on its own. The reachability half is where
the unknown unknowns live, and it produces no signal until markers exist.

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
      dir. A group with no mapping, or no file, reports unwired with a
      reason instead of a crash
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
- [x] 3b.5 Give the ratchet a pawl. Add a "Tighten coverage-gate baseline" CI
      step, mirroring `quality-baseline.json`'s own tighten step. It commits a
      scenario's improvement back once reachability can produce
      covered-and-integrated at all. It stays inert while nothing is covered
      yet, and becomes load-bearing the day something is
- [x] 3b.6 Detect a renamed requirement or scenario title. A scenario id that
      was in the baseline but is missing from the current run is an orphan.
      `compareToBaseline` only iterates current scenarios, so a rename today
      silently re-adopts the new id at whatever outcome `cover` finds. A
      covered-and-integrated scenario can drop to unwired with no regression
      reported, because the old id and the new id never collide in the
      comparison

## 4. Rework `steps`

**Bootstrap phase - hand-run, not `/step-by-step`.** `/step-by-step`'s
Finishing phase calls `dod-guard trace` and offers `dod-guard check` as a
`verify_cmd` surface. Both commands were deleted when the proof engine was
removed. Every remaining item in this file runs under a skill that cannot yet
close a session. The steps-rebuild work below must land by hand first,
together with the item that repoints `/step-by-step` at `dod-guard cover`.
After that, every remaining item - the coverage-gate follow-ups, the skill
rewrites, and the docs cleanup - is `/step-by-step`-able.

- [x] 4.1 Add the "a task binds to a scenario through an annotation"
      requirement to `specs/dod-guard/steps-generation/spec.md` (done - see
      the two new scenarios already in that file) and confirm
      `openspec validate route-skills-through-openspec --strict --no-interactive`
      still passes
- [x] 4.2 Write `packages/dod-guard/src/openspec/tasks-parser.ts`: parse
      `tasks.md` into ordered items, each carrying its checkbox state, text,
      and an optional `covers` scenario id read from the
      `<!-- covers: <group>/<capability> :: <requirement> :: <scenario> -->`
      annotation on the line below it. No second markdown parser - reuse
      whatever line-scanning approach `cover/markers.ts` already established
      for the same annotation shape in test files.
- [x] 4.3 Write `packages/dod-guard/src/openspec/build-steps.ts`:
      `buildSteps(tasksItems, coverReports)` maps each parsed item to a step
      object (`id`, `title` from the task text, `description`, `files: []`,
      `deps` naming the immediately preceding step's id, `verify_surface:
      "code"`, `status: "pending"`). An item with a `covers` id whose
      `coverReports` entry is covered-and-integrated or
      covered-but-not-integrated gets that scenario's bound test's run command
      as `verify_cmd` and `manual_required: false`. Every other item
      (no annotation, or annotation naming an unwired/failed/absent scenario)
      gets `verify_cmd: ""` and `manual_required: true`.
- [x] 4.4 Write `packages/dod-guard/src/openspec/steps-cli.ts`. It resolves
      `tasks.md`'s path for a change id through the OpenSpec CLI, the same
      way `cover/run.ts` already does. It never composes
      `openspec/changes/<id>/tasks.md` from string parts. It runs `dod-guard
      cover <change-id>` to get `coverReports`, calls `buildSteps`, and
      writes `openspec/changes/<change-id>/steps.json`. That file holds
      `goal`, `cwd`, `plan_source` set to the change id, and `plan_artifacts`
      from `openspec status --json --change <id>`. It exits 0 on success and
      3 when the change has no `tasks.md` or argv is malformed.
- [x] 4.5 Wire `steps` into `cli.ts`'s `COMMANDS` map, same shape as `cover`'s
      entry
- [x] 4.6 Write `packages/dod-guard/src/openspec/steps-cli.test.ts`. The
      file's own scenario count is 8, not the 7 estimated here: 6
      pre-existing plus the 2 the annotation requirement added. Give it one
      test per scenario in `steps-generation/spec.md`. Each test carries the
      matching `// covers:` marker. Each calls `runCli(["steps", ...])`
      rather than importing `build-steps.ts` directly. `dod-guard cover`'s
      entry-point check only reaches `covered-and-integrated` through the
      CLI path. So the marker's THEN clause must name `steps-cli.test.js`,
      not a direct import of the generator
- [x] 4.7 Declare `packages/dod-guard/src/cli.ts` as this capability's entry
      point in `openspec/entry-points.json`. It is already listed, from the
      coverage-gate work - confirmed, not duplicated
- [x] 4.8 `npm run build -w packages/dod-guard && npm test -w packages/dod-guard`
      runs green. `dod-guard cover route-skills-through-openspec` reports
      every new steps-generation scenario covered-and-integrated. `dod-guard
      steps route-skills-through-openspec` writes a real `steps.json` mixing
      bound and manual steps: 57 manual, because the change's own
      `tasks.md` items carry no `covers` annotations yet. That is the
      correct, honest result
- [x] 4.9 Rebundle and regenerate `.github/quality/coverage-gate-baseline.json`
      via `dod-guard cover --all --write-baseline`. The result is
      byte-identical to the committed baseline: `--all` reads
      `openspec/specs/**`, and this change's new scenarios live in its own
      unarchived delta, not yet merged there

## 5. Skills

- [x] 5.1 Rewrite `/interview`: drop the DoD authoring policy, the `dod_create`
      fallback, the `docs/plans/` path; add scenario-writing and test-binding
      guidance
- [x] 5.2 **Bootstrap.** Rewrite `packages/dod-guard/skills/step-by-step/SKILL.md`:
      - Delete the "DoD subtree proofs" section (lines ~137-143) outright. A
        bound step's `verify_cmd` is now the scenario's test command directly;
        there is no subtree command left to document.
      - In Finishing, replace the `dod-guard trace` paragraph with a
        `dod-guard cover <change-id>` run. Exit 0 means every scenario
        matches or improves on the coverage-gate baseline. Exit 1 means one
        scenario regressed. Exit 3 means usage error. On exit 1 or 3, stop
        and report the regression without archiving. On exit 0, run
        `openspec archive <change-id> --yes`.
      - Delete every `.step-session/`, `progress.log`, and `plan_mtime`
        reference; drop the plan-file (non-OpenSpec) session branch in
        "Before you start" and Persistence, keeping only the OpenSpec-change
        session shape.
      - Confirm `node scripts/ci/check-skill-hygiene.mjs --rule=no-step-session`
        and `--rule=plan-home` both exit 0 against the rewritten file
- [x] 5.3 Strip `/cheap-step`'s `.step-session` and `progress.log` references
- [x] 5.4 Move `/quality-refactor` onto a change with `skip_specs: true`, waves
      into `tasks.md`, plan into the change's `steps.json`, judgment into
      `design.md`
- [x] 5.5 Give `/ratchet` a change id; close on `dod-guard cover` reporting zero
      regressions, then `openspec archive`
- [x] 5.6 Give `/adversarial-workflow` a change id; move its four GO/REVISE/STOP
      verdicts into `design.md`; close on cover then archive
- [x] 5.7 Make `/blind-rewrite` write the code contract as the change's spec
      delta before deletion, leave only quarantine in `.blind/`
- [x] 5.8 Make each `/tighten` target open a change; reduce the ledger to a
      scanner queue closing on the target's change archiving
- [x] 5.9 Drop the `dod_create` reference from `/test-integrity-checker`
- [x] 5.10 Drop dod-guard tool-name references from `/clean-house`
- [x] 5.11 Update `check-skill-hygiene.mjs`'s rule set for the new vocabulary:
      - Retire `dod-instruction`, `schema-steps-deps`, and
        `interview-fetches`. Each one polices a deleted DoD schema artifact
        or fetch that no longer exists. Delete each rule from `RULES`, its
        fixture cases in `check-skill-hygiene.test.mjs`, and any now-unused
        fixture helpers in `fixtures/skill-hygiene.mjs`
      - Fix `closing-gate` in `skill-hygiene-rules.mjs`: it still checks for
        `dod-guard trace` before `openspec archive`; change it to
        `dod-guard cover` before `openspec archive`, matching
        `change-scoped-skills`'s spec. Update both `closing-gate` fixture
        cases in `check-skill-hygiene.test.mjs` and the `goodTree` fixture in
        `fixtures/skill-hygiene.mjs` (lines ~52-55, which still say
        `dod-guard trace`)
      - Extend `no-legacy-fallback` to also fail when a skill claims
        `/interview` generates or builds a DoD. This matches
        `change-scoped-skills`'s "no skill claims interview builds a DoD"
        scenario. Add one breaking and one passing fixture case for it
      - Confirm the meta-test ("covers every rule the script defines") still
        passes with the new rule count
- [x] 5.12 `/tighten`'s `pick-target.mjs`, `seed-ledger.mjs`, and
      `record-result.mjs` still implement the pre-5.8 ledger-only semantics:
      a persistent queue keyed by file, with no change id anywhere. 5.8's
      SKILL.md rewrite describes change-scoped, archive-driven completion
      instead - one OpenSpec change per target, closing when that change's
      `dod-guard cover` + `openspec archive` runs. Rework the three scripts
      (and `lib/ledger.mjs`/`lib/ledger-file.mjs` underneath them) to match:
      each picked target opens or resumes a change, `record-result.mjs`
      records against that change's own artifacts rather than a shared
      ledger file, and the ledger's role shrinks to the scanner queue 5.8's
      SKILL.md already promises. Update `pick-target.test.mjs` and
      `seed-ledger.test.mjs` for the new contract. This is what makes 5.8's
      `[x]` true instead of aspirational

## 6. Docs and cleanup

- [x] 6.1 Remove `.step-session/` from `.gitignore`, `scripts/ci/lib/fs-utils.mjs`,
      `quality-refactor/scripts/lib/config.mjs`
- [x] 6.2 Rewrite `packages/dod-guard/CLAUDE.md`: it documents 10 predicate
      types, `checker.ts`, `evaluate-proof.ts`, `fingerprint.ts`, and
      `dod_check` - none of which exist. Replace the Architecture, "Core
      principle", "Predicate types", "Proof categories", "Proof execution
      flow", "File responsibilities", "MCP tools", and "Adding a new
      predicate type" sections with the `cover`/`steps` architecture: scenario
      identity, the marker convention, entry-point declaration, the
      coverage-gate ratchet, and the current file responsibility table
- [x] 6.3 Update `packages/dod-guard/README.md` and `USAGE.md` for the same
      `cover`/`steps` model
- [ ] 6.4 Delete the DoD markdown format spec and predicate reference under
      `packages/dod-guard/docs/`
- [ ] 6.5 Fold `packages/dod-guard/docs/shortcomings.md`'s findings into this
      change's own `design.md` Context, then delete the file - it currently
      describes a system that no longer exists
- [ ] 6.6 Update four spots in the root `CLAUDE.md`. The CLI table gains
      `steps` and `cover` and drops `check`, `status`, `tree`, `list`, and
      `trace`. The plugin-config gate table's `check-trace.mjs` row becomes
      `check-coverage-gate.mjs`. The Ratchets table gains the coverage-gate
      baseline. The `evomcp -> dod-guard` cross-package example command
      changes from `dod_check --node-path=0.children.1` to a `dod-guard
      cover`-bound test's run command
