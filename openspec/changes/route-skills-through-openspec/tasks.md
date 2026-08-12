## 1. Guard

The guard lands first, so every later step has a failing check to satisfy.

- [x] 1.1 Write `scripts/ci/check-skill-hygiene.mjs` with the rules
      `no-step-session`, `plan-home`, `no-authoring-copy`, `no-legacy-fallback`,
      `change-scoped`, `dod-instruction`, `schema-steps-deps`,
      `interview-fetches`, `closing-gate` and `refactor-skip-specs`, each
      selectable with `--rule=` and all of them run when the flag is absent
- [x] 1.2 Write `scripts/ci/check-skill-hygiene.test.mjs`, feeding each rule a
      known-bad fixture, so a rule that cannot fail is caught
- [x] 1.3 Add the guard to the `plugin-config` CI job

## 2. Converter fidelity

- [ ] 2.1 Teach `extractRequirementBlocks` the `## ADDED` / `## MODIFIED` /
      `## REMOVED` / `## RENAMED` headings, and drop every requirement under
      `## REMOVED Requirements` so it produces no group and no leaf
- [ ] 2.2 Render a concrete leaf's title in `author.ts` and read it back in
      `parser.ts`, in place of the `title: desc` fallback
- [ ] 2.3 Give `dod_amend` a title parameter and pass it from
      `amendChangedLeaf` in `regenerate-dod.ts`
- [ ] 2.4 Update the DoD markdown format spec under `packages/dod-guard/docs/`
      for the rendered title

## 3. Schema

- [ ] 3.1 Replace the `dod` artifact's placeholder instruction with the
      authoring policy: predicate table, category table, `timeout_ms` rule,
      regex-for-unwritten-test rule, company baseline, integration proof pair,
      `MANUAL:` inspection triggers, test-first pair, and the rule that a
      scenario's THEN line carries the proving command
- [ ] 3.2 Change the `steps` artifact's `requires` from `[dod]` to `[tasks]`
      and rewrite its instruction to run `dod-guard steps <change-id>` first,
      then fill `files` and `verify_surface` by judgment
- [ ] 3.3 Make `templates/steps.json` the one authoritative field list

## 4. Code

- [ ] 4.1 Give `fetchInstructions` an artifact id parameter in place of its
      hardcoded `dod`
- [ ] 4.2 Add the `dod-guard steps <change-id>` subcommand to `cli.ts`, wrapping
      `dodTreeToSteps` with `goal`, `cwd`, `plan_source` and `plan_artifacts`

## 5. Skills

- [ ] 5.1 Cut `/interview` down: delete the spec-delta tutorial, both tables,
      the baseline, integration, human-judgement and test-first subsections, the
      `dod_create` fallback, the `docs/plans/` path, and the stale note about
      `dod_generate` being unreachable
- [ ] 5.2 Point `/step-by-step` at `openspec/changes/<id>/steps.json`, delete
      `.step-session/`, `progress.log`, plan-file sessions and the mtime
      staleness branch, and state why the two progress records both stay
- [ ] 5.3 Strip `/cheap-step`'s `.step-session` and `progress.log` references
- [ ] 5.4 Move `/quality-refactor` onto a change with `skip_specs: true`, waves
      into `tasks.md`, plan into the change's `steps.json`, judgment into
      `design.md`, and delete its inline steps.json literal
- [ ] 5.5 Give `/ratchet` a change id, fix its `dod_create` claim, tick
      `tasks.md` per sub-problem, and close on trace then archive
- [ ] 5.6 Give `/adversarial-workflow` a change id, fix its `dod_create` claim,
      and close phase 4 on trace then archive
- [ ] 5.7 Make `/blind-rewrite` write the code contract as the change's spec
      delta before deletion, leave only quarantine in `.blind/`, and fix the
      RFC 2119 keyword contradiction
- [ ] 5.8 Make each `/tighten` target open a change, and reduce the ledger to a
      scanner queue
- [ ] 5.9 Drop the `dod_create` reference from `/test-integrity-checker`, which
      the guard found and the plan had missed

## 6. Docs and cleanup

- [ ] 6.1 Remove `.step-session/` from `.gitignore` and from
      `scripts/ci/lib/fs-utils.mjs` and `quality-refactor/scripts/lib/config.mjs`
- [ ] 6.2 Update `packages/dod-guard/README.md`, `USAGE.md` and `CLAUDE.md` for
      the new plan home and the `steps` subcommand
- [ ] 6.3 Update the root `CLAUDE.md` CLI table and gate table
