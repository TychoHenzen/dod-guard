## Why

`tasks.md` and `steps.json` carry the same information in two formats. `tasks.md` is a checklist with `<!-- covers: -->` annotations. `steps.json` is a JSON plan with `verify_cmd`, `deps`, `status`, and `manual_required` per step. `dod-guard steps` derives one from the other, and the step-by-step skill keeps them synchronized by checking off `tasks.md` lines whenever it updates `steps.json` status. That synchronization is the problem: two files that must agree are two files that can disagree.

`tasks.md` should be the only file. The metadata that `steps.json` carries - `verify_cmd`, `manual_required`, step status - should live as inline HTML comments in `tasks.md` itself. The skill resolves `verify_cmd` at startup by running the same cover lookup that `dod-guard steps` does today, and writes status updates directly into `tasks.md`.

## What Changes

- **`tasks.md` gains inline metadata.** Each task item can carry HTML comments for `verify_cmd`, `manual_required`, `status`, and `verify_surface` on the lines following the checkbox. The `<!-- covers: -->` annotation already uses this pattern.
- **`steps.json` is removed as a concept.** The schema artifact, the `dod-guard steps` CLI command, the `steps-cli.ts` and `build-steps.ts` source files, and every skill/spec/doc reference to `steps.json` are deleted.
- **Step-by-step resolves `verify_cmd` at startup.** It parses `tasks.md`, runs the cover lookup for each annotated task, and caches the result for the session. No intermediate file.
- **Status is written back to `tasks.md`.** `- [ ]` becomes `- [x]` on completion (already happens). `<!-- status: blocked -->` or `<!-- status: skipped -->` are written as inline comments for non-completion states.
- **`/opsx:propose` stops running `dod-guard steps`.** It writes `tasks.md` and is done.
- **The `dod-guard-spec-driven` schema drops the `steps` artifact.** `apply.requires` becomes `[tasks]` only.
- **Skills that reference `steps.json`** (`step-by-step`, `cheap-step`, `ratchet`, `opsx-apply`, `opsx-update`, `opsx-guide`, `quality-refactor`) are updated to reference `tasks.md` metadata instead.
- **Specs that reference `steps.json`** (`steps-generation`, `step-by-step`, `cheap-step`, `ratchet`, `change-scoped-skills`, `opsx-quick`, `opsx-guide`, `quality-guard/refactor-planning`, `quality-guard/quality-refactor`) are updated or removed.
- **CI scripts** (`skill-hygiene-rules.mjs`) drop rules that lint `steps.json` references.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dod-guard/step-by-step`: The persistence requirement changes from `steps.json` to `tasks.md` with inline metadata. The staleness check requirement changes to detect stale `tasks.md` metadata rather than a stale `steps.json` snapshot.
- `dod-guard/steps-generation`: **REMOVED.** The `dod-guard steps` command and its spec are deleted entirely. The behavior it provided (resolve `verify_cmd` from cover report) moves into the step-by-step skill's startup logic.
- `dod-guard/cheap-step`: References to `steps.json` become references to `tasks.md` metadata.
- `dod-guard/ratchet`: References to `steps.json` become references to `tasks.md` metadata.

## Impact

- **Source code**: `steps-cli.ts`, `build-steps.ts`, `steps-cli.test.ts` deleted. `cli.ts` drops the `steps` subcommand. `tasks-parser.ts` gains metadata parsing/writing.
- **Schema**: `openspec/schemas/dod-guard-spec-driven/schema.yaml` drops the `steps` artifact and its template.
- **Skills**: 7 SKILL.md files updated (step-by-step, cheap-step, ratchet, opsx-propose, opsx-apply, opsx-update, opsx-guide). `quality-refactor` in quality-guard also updated.
- **Specs**: 9 spec files updated or removed.
- **CI**: `skill-hygiene-rules.mjs` and its test/fixture files updated.
- **Docs**: `CLAUDE.md` (root and dod-guard), `README.md`, `USAGE.md` updated.
- **Breaking**: Any existing `steps.json` files in active changes become dead weight. The skill ignores them.
