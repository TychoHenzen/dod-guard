## 1. Source code changes

- [x] 1.1 Extend `tasks-parser.ts` to parse and write inline metadata comments (`<!-- status: -->`, `<!-- verify_cmd: -->`, `<!-- verify_surface: -->`, `<!-- manual_required: -->`) alongside existing `<!-- covers: -->` support
<!-- covers: dod-guard/step-by-step :: persistence in tasks.md :: tasks.md line checked off with step completion -->

- [x] 1.2 Delete `steps-cli.ts`, `build-steps.ts`, and `steps-cli.test.ts`
<!-- covers: dod-guard/steps-generation :: steps subcommand writes the change's plan -->

- [x] 1.3 Remove the `steps` subcommand from `cli.ts` USAGE string and argument routing

## 2. Schema and template changes

- [x] 2.1 Remove the `steps` artifact from `openspec/schemas/dod-guard-spec-driven/schema.yaml` and change `apply.requires` to `[tasks]` only

- [x] 2.2 Delete the `steps.json` template file if one exists under the schema's templates directory

## 3. Skill updates

- [x] 3.1 Rewrite `step-by-step/SKILL.md` to read `tasks.md` directly, resolve `verify_cmd` at startup via cover lookup, write status as inline metadata, and drop all `steps.json` references
<!-- covers: dod-guard/step-by-step :: verify_cmd resolved at startup :: annotated task gets verify_cmd from cover -->

- [x] 3.2 Update `cheap-step/SKILL.md` to reference `tasks.md` metadata instead of `steps.json`
<!-- covers: dod-guard/cheap-step :: inherits step-by-step base discipline :: step ordering matches step-by-step -->

- [x] 3.3 Update `ratchet/SKILL.md` to reference `tasks.md` instead of `steps.json`
<!-- covers: dod-guard/ratchet :: requires a confirmed OpenSpec change id :: change id with existing tasks.md -->

- [x] 3.4 Update `opsx-propose/SKILL.md` to stop running `dod-guard steps` after writing `tasks.md`

- [x] 3.5 Update `opsx-apply/SKILL.md` to remove `steps.json` freshness checks

- [x] 3.6 Update `opsx-update/SKILL.md` to stop regenerating `steps.json`

- [x] 3.7 Update `opsx-guide/SKILL.md` to remove `steps.json` from its concept list

- [x] 3.8 Update `quality-guard/skills/quality-refactor/SKILL.md` to write task plans to `tasks.md` instead of `steps.json`

## 4. Spec updates

- [x] 4.1 Update remaining affected specs (`change-scoped-skills`, `opsx-quick`, `opsx-guide`, `quality-guard/refactor-planning`, `quality-guard/quality-refactor`) to reference `tasks.md` instead of `steps.json`

## 5. CI and docs

- [x] 5.1 Update `skill-hygiene-rules.mjs` and its test/fixture files to drop `steps.json`-related rules

- [x] 5.2 Update `CLAUDE.md` (root), `packages/dod-guard/CLAUDE.md`, `README.md`, and `USAGE.md` to remove `steps.json` and `dod-guard steps` references

## 6. Verification

- [x] 6.1 Run build, tests, and `openspec validate --strict --no-interactive` to confirm everything is consistent
