# Tasks

## 1. Parser learns about groups

- [x] 1.1 Add a group-aware read to `packages/dod-guard/src/openspec/tasks-parser.ts`: expose each `## <digits>.` heading with the checkbox items beneath it, leaving `parseTasksMarkdown` and every existing item field unchanged.
<!-- covers: dod-guard/coverage-gate :: The task parser exposes group headings and their items :: Groups and items are reported together -->
<!-- status: completed -->
- [x] 1.2 Cover the case of a checkbox item appearing above the first group heading, so it still parses as a task and belongs to no group.
<!-- covers: dod-guard/coverage-gate :: The task parser exposes group headings and their items :: Items above the first group heading still parse -->
<!-- status: completed -->

## 2. cover refuses an unexpanded plan

- [x] 2.1 Add the plan-incomplete exit code to `packages/dod-guard/src/cli.ts`, distinct from the regression and usage-error codes, and extend the `USAGE` string to name it.
<!-- covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A heading-only group blocks the run -->
<!-- status: completed -->
- [x] 2.2 Read the change's `tasks.md` in the change-scoped path of `packages/dod-guard/src/cover/run.ts`, report every unexpanded group by name, and exit with the plan-incomplete code.
<!-- covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A fully expanded plan passes the check -->
<!-- status: completed -->
- [x] 2.3 Skip the check when `tasks.md` is absent, so ordinary planning before the artifact exists is not blocked.
<!-- covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A change with no tasks.md is not blocked by this check -->
<!-- status: completed -->
- [x] 2.4 Leave `--all` runs alone: they read no `tasks.md` and never return the plan-incomplete code.
<!-- covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: An --all run skips the check -->
<!-- status: completed -->
- [x] 2.5 Confirm a `## Notes` heading and a `### ` subheading are not treated as groups, matching only `## <digits>.`.
<!-- covers: dod-guard/coverage-gate :: cover refuses a change whose task groups are not expanded :: A prose heading is not a group heading -->
<!-- status: completed -->
- [x] 2.6 Run the finished check over every `tasks.md` under `openspec/changes/archive/` and confirm it flags only `2026-08-17-neurodivergent-output-style`, matching the measurement design.md records.
<!-- status: completed -->


## 3. The /opsx-continue skill

- [x] 3.1 Write `packages/dod-guard/skills/opsx-continue/SKILL.md` with frontmatter `name: opsx-continue`, a description, and store selection matching the other `opsx-*` skills. It reads artifact ids and paths from `openspec status --change <id> --json` and never hardcodes them.
<!-- covers: dod-guard/opsx-continue :: The skill advances the build frontier :: A change holding only a proposal -->
<!-- status: completed -->
- [x] 3.2 Specify the skipped-artifact and already-planned cases: create nothing for a `skipped` artifact, and when every artifact exists, write nothing and point at `/opsx-update`.
<!-- covers: dod-guard/opsx-continue :: The skill advances the build frontier :: An artifact marked skipped stays absent -->
<!-- status: completed -->
- [x] 3.3 Specify wave writing: every `## N.` group heading up front, checkboxes for the near wave only, `<!-- covers: -->` on each bound item, and no plan format beyond those two levels.
<!-- covers: dod-guard/opsx-continue :: Task groups are named before they are expanded :: First pass writes all headings and one expanded wave -->
<!-- status: completed -->
- [x] 3.4 Specify re-invocation: leave expanded groups and their checked state untouched, expand the next heading-only group, append rather than renumber, and read the implementation the earlier waves produced first.
<!-- covers: dod-guard/opsx-continue :: Re-invocation expands the next wave :: Second run expands the second group only -->
<!-- status: completed -->
- [x] 3.5 Specify the two remaining re-invocation cases: report and ask the user when implementation contradicts a proposal assumption about a later group, and report a fully expanded plan without writing.
<!-- covers: dod-guard/opsx-continue :: Re-invocation expands the next wave :: No unexpanded group remains -->
<!-- status: completed -->
- [x] 3.6 Specify per-artifact validation with `openspec validate <id> --strict --no-interactive`, repairing and re-validating before moving to the next artifact.
<!-- covers: dod-guard/opsx-continue :: The change is validated after each artifact :: Validation fails after an artifact is written -->
<!-- status: completed -->
- [ ] 3.7 Confirm the new SKILL.md passes `node scripts/ci/check-skill-hygiene.mjs`, which runs `no-authoring-copy`, `no-legacy-fallback`, and `no-step-session` against every skill.

## 4. Rewire references and register the skill

- [ ] 4.1 Update `packages/dod-guard/skills/opsx-update/SKILL.md`: `/opsx:continue` becomes the real `/dod-guard:opsx-continue`, dropping the "expanded-profile workflow and may not be installed" hedge and its availability check.
- [ ] 4.2 Update `packages/dod-guard/skills/opsx-apply/SKILL.md` the same way.
- [ ] 4.3 Add the skill to `packages/dod-guard/.claude-plugin/marketplace.json`, `packages/dod-guard/.claude-plugin/plugin.json`, and the root `.claude-plugin/marketplace.json`, changing all three "Ships 28 skills" claims to 29.
- [ ] 4.4 Add the skill row to the `packages/dod-guard/CLAUDE.md` Bundled Skills table and to the dod-guard skill list in the root `CLAUDE.md`.
- [ ] 4.5 Run `node scripts/ci/validate-plugins.mjs` and confirm the skill count, every `/slug` reference, and git tracking of the new file all pass.

## 5. Gates and baselines

- [ ] 5.1 Run `npm run clean && npm run build && npm test` from the root and confirm green.
- [ ] 5.2 Rebaseline the quality and coverage baselines for the new and changed source files in this same commit, and confirm no new entry is needed in `untested-sources.txt`.
- [ ] 5.3 Run `npx @biomejs/biome check packages/*/src/`, `node scripts/ci/check-coverage-gate.mjs`, and `node scripts/ci/check-skill-hygiene.mjs`, and confirm all three pass.
