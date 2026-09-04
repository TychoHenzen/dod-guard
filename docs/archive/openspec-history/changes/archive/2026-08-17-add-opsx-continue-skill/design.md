# Design

## Context

See proposal.md - Why. Two facts found by reading the code decide most of what
follows.

`parseTasksMarkdown` in `packages/dod-guard/src/openspec/tasks-parser.ts`
collects only lines matching `- [ ]`. Headings are skipped entirely, and
`isContinuation` uses them only to end an item's text. So a group heading with no
checkboxes is invisible: it contributes no task, and a change whose later waves
are heading-only looks finished to `/step-by-step`.

`dod-guard cover` does not read `tasks.md` at all today. A grep across
`src/cover/` and `src/cli.ts` finds no reference. So the plan-completeness check
is new wiring into `cover`, not an adjustment of something already there.

## Goals / Non-Goals

**Goals**

- One skill that creates missing artifacts for an existing change, re-invocable.
- Wave planning inside the `tasks.md` levels that already exist.
- An archive refusal that sits at a gate every archiving skill already runs.

**Non-Goals**

- No new plan file, no nested checkboxes, no per-group metadata block.
  `check-skill-hygiene`'s `no-authoring-copy` rule exists to stop a skill
  inventing a second plan format, and the two-level structure is enough.
- No change to `bound`/`unwired` reporting, the ratchet, or baseline adoption.
- No revision of artifacts that already exist. That stays `/opsx-update`'s job,
  and the two skills meet at the build frontier.

## Decisions

### Put the refusal in `dod-guard cover`, not in the archiving skills

`skill-hygiene-rules.mjs` already enforces, via the `closing-gate` rule, that
`/ratchet` and `/adversarial-workflow` run `dod-guard cover` before
`openspec archive`. `opsx-apply`, `opsx-archive`, and `opsx-quick` follow the
same order. So `cover` is the one chokepoint every archive path passes through.

Alternative considered: an instruction in each archiving skill. Rejected, because
an instruction is not a gate, and it would need editing in five skills and be
enforced in none.

Alternative considered: a new `dod-guard` subcommand. Rejected for the same
reason - nothing would compel a skill to call it.

### A distinct exit code, not a reuse of the regression code

`cover` exits 0 for no regressions, 1 for a regression, 3 for a usage error.
Reusing 1 would make every skill announce a coverage regression when the real
problem is an unexpanded plan; `opsx-quick` phase 5 says literally "1: Report the
regression and stop." So the plan-incomplete case takes its own code.

The existing `coverage-gate` spec names exit codes abstractly ("the usage-error
code", "the regression exit code") and never numerically. Adding a code therefore
does not modify an existing requirement, which is why the delta is ADDED and the
MODIFIED copy-the-whole-block trap is avoided.

### A group heading is `## <digits>.` and nothing else

The schema's tasks instruction says "Group related tasks under ## numbered
headings", so the numbering is part of the format rather than a convention.

This definition was tested against the 21 archived changes that have a
`tasks.md`, holding 90 numbered groups between them.

- "Any heading with no checkbox" fails immediately: every file's `# Tasks` title
  matches, and one change uses `##` for prose subsections such as
  "Working memory" inside a group. 18 false positives in one file alone.
- "`## <digits>.` with no checkbox before the next such heading" flags one file
  out of 21.

That one file, `2026-08-17-neurodivergent-output-style/tasks.md`, contains no
checkbox anywhere - its groups are prose instructions. So it is not a
half-expanded plan, it is a differently shaped one.

**Reading taken**: the request was that archive refuse "a change that has headers
without subtasks", and a file with no checkboxes anywhere has headers without
subtasks. So that shape is refused too, rather than exempted. The consequence is
narrow: `cover <change-id>` runs against active changes, that change is already
archived, and archived changes are never re-scanned by a change-scoped run.

Rejected alternative: exempt files with zero checkboxes, which would let a plan
made entirely of prose headings archive. That contradicts the request.

### `tasks.md` absent is not this check's failure

`cover <change-id>` runs before `tasks.md` exists during normal planning.
Treating a missing file as a refusal would break the ordinary flow, and
`openspec status` already reports a missing artifact. So the check is skipped
when the file is absent, and applies when it is present.

## Risks / Trade-offs

- **The check is untested by CI.** `check-coverage-gate.mjs` runs `cover --all`,
  and the check is change-scoped only. -> Unit tests are the sole enforcement, so
  the tasks below require test cases for each scenario, and the spec states the
  asymmetry so a later reader does not read it as an oversight.
- **A wave-planned change reads as "nearly done" to a human skimming checkboxes.**
  Five of five items checked, three groups still unexpanded. -> `cover` names the
  unexpanded groups in its output, so the state is visible at the gate rather
  than only in the file.
- **Group renumbering across waves.** Inserting a group learned during wave two
  would renumber later groups and break nothing (ids come from item text, not
  headings), but it does churn the file. -> The skill appends a new group rather
  than renumbering, and says so.
- **New source files move two baselines.** -> The quality and coverage baselines
  are rebaselined in the same commit, and every new `src/*.ts` gets a matching
  `*.test.ts` so `untested-sources.txt` does not fail.

## Migration Plan

No data or config migration. The new exit code is additive: a change with a fully
expanded `tasks.md`, and every change that exists today, keeps its current
`cover` behavior. The three "Ships 28 skills" descriptions go to 29 in the same
commit as the skill, because `validate-plugins.mjs` checks that count against the
real number of skill directories and fails the build otherwise.
