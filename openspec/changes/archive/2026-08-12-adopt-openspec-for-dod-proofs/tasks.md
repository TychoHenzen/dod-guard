## 1. Schema: the dod artifact (items 7 to 9)

- [x] 1.1 (item 7) Run `openspec schema fork` on the default schema. Add a
      `dod` artifact to the new `schema.yaml`, output path `dod.md`,
      `requires: [specs]`.
- [x] 1.2 (item 8) Write the `dod` artifact's template into that schema's
      `templates/` folder, in the format `packages/dod-guard/src/parser.ts`
      parses.
- [x] 1.3 (item 9) Add `dod` to `applyRequires` in the forked schema.

## 2. DoD generation from spec deltas (items 10 to 14)

- [x] 2.1 (item 10) Write the converter. Input:
      `openspec instructions dod --change <id> --json`. Output: DoD
      markdown.
- [x] 2.2 (item 11) Map one scenario to one leaf. Group leaves under their
      `### Requirement:` heading.
- [x] 2.3 (item 12) Map an uncheckable scenario to a draft leaf with a
      `MANUAL:` intent, held at INCOMPLETE.
- [x] 2.4 (item 13) Register the generated file with `dod_import`
      (`{ path, cwd }`) at `openspec/changes/<id>/dod.md`.
- [x] 2.5 (item 14) Implement leaf-level diffing on regeneration so an
      unchanged scenario keeps its leaf's fingerprint intact (see
      design.md, Decisions). Confirm `dod_amend` can target a leaf subset.
      Extend it if not.

## 3. Closure check (item 15 and the closure rule)

- [x] 3.1 (item 15) Add `dod-guard trace <change-id>` to
      `packages/dod-guard/src/cli.ts`.
- [x] 3.2 (closure rule) Implement the leaf-to-scenario direction: an
      untraced leaf fails the command (non-zero exit).
- [x] 3.3 (closure rule) Implement the scenario-to-leaf direction: an
      untraced scenario with no `MANUAL:` draft is named in the report
      without changing the exit code.
- [x] 3.4 (closure rule) Add `dod-guard trace` to the CI gate table in
      `CLAUDE.md`.

## 4. steps.json as a schema artifact (items 21 to 23)

- [x] 4.1 (item 21) Make `steps.json` a schema artifact with
      `requires: [dod]`.
- [x] 4.2 (item 22) Write the converter from DoD leaves to steps: proof
      command becomes `verify_cmd`, intent becomes the step title.
- [x] 4.3 (item 23) Map a `MANUAL:` draft leaf to a step with
      `manual_required: true`.

## 5. /step-by-step rewrite (items 24 to 29)

- [x] 5.1 (item 24) Add the `Requirement` briefing field carrying the
      scenario's `WHEN` and `THEN` verbatim.
- [x] 5.2 (item 25) Add the `ASSUMPTION:` rule to the briefing text.
- [x] 5.3 (item 26) Rework the staleness check to key off
      `openspec status --json` instead of `plan_source` mtime comparison.
- [x] 5.4 (item 27) Add OpenSpec (a change proposed through
      `/opsx:propose`) to the callers list at `SKILL.md:143-145`.
- [x] 5.5 (item 28) Make the orchestrator commit after each verified step.
      Update the `step-*` agent definitions to match.
- [x] 5.6 (item 29) Extend Finishing: on a green integration check, run
      `dod-guard trace`, then `openspec archive <id> --yes`.

## 6. /cheap-step mirror and adversarial review (items 30 to 31)

- [x] 6.1 (item 30) Mirror tasks 5.1 to 5.6 into `/cheap-step`, keeping its
      `mode` field.
- [x] 6.2 (item 31) Feed the spec delta text to adversarial reviewer
      agents, not only the code diff.

## 7. /interview rewrite (items 16 to 20)

- [x] 7.1 (item 16) Rewrite `/interview` Phase 4 to write an OpenSpec
      change and generate the DoD from it, instead of calling `dod_create`
      with prose sections.
- [x] 7.2 (item 17) Keep the question floors and the adversarial spec
      review step.
- [x] 7.3 (item 18) Move confirmed answers into requirements and
      scenarios. Move unconfirmed answers into the DoD `open_questions`
      field (`packages/dod-guard/src/types.ts:171-176`).
- [x] 7.4 (item 19) Add a Low, Medium or High risk label to each question.
      Cap clarifying questions at 3 per round.
- [x] 7.5 (item 20) Name `/opsx:apply` as an executor option in the
      handoff table.

## 8. ASSUMPTION marker and its audit (items 32 to 36)

- [x] 8.1 (item 32) Resolve the collision with the existing `todo-marker`
      rule in
      `packages/quality-guard/skills/quality-refactor/scripts/lib/violations.mjs`
      so an `ASSUMPTION:` comment does not trip it.
- [x] 8.2 (item 33) Add the `assumption-marker` rule: it counts and never
      fails. Rebaseline `.github/quality/quality-baseline.json` in the
      same commit.
- [x] 8.3 (item 34) Write the `ASSUMPTION: <what and why>` convention into
      `~/.claude/CLAUDE.md`.
- [x] 8.4 (item 35) Build the audit: find every hit with
      `grep -rn "ASSUMPTION"`. Assign each one a verdict of confirmed and
      deleted, wrong and fixed, or still open.
- [x] 8.5 (item 36) Decide where the audit runs. Default to a skill, since
      judging whether a guess still holds needs reading the surrounding
      code.
