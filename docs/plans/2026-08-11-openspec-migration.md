# Sitting dod-guard on top of OpenSpec

Source: `docs/Assume.md`. This plan turns that research into work items.

## The decision

OpenSpec owns intent. dod-guard owns proof.

OpenSpec already ships the lifecycle that `docs/Assume.md` recommends. It holds
what is built in `openspec/specs/`, and what should change in
`openspec/changes/`. It archives a change once shipped. That is the
proposed, accepted and superseded split, enforced by a CLI.

dod-guard holds the part OpenSpec has no answer for. A scenario says what
should happen. A DoD leaf says which command proves it, and stores that proof
so nobody can quietly edit it.

So the seam is one scenario to one DoD leaf.

We drop the separate `decisions.md` idea. An accepted OpenSpec requirement is
the decision record. A second file would only drift from it.

## Verified facts this plan rests on

Read from the OpenSpec docs on 2026-08-11, not from memory:

- Install is `npm install -g @fission-ai/openspec@latest`. It needs Node
  20.19 or higher. This machine runs Node 22.15, so it qualifies.
- `openspec init` creates `openspec/` holding `specs/`, `changes/` and an
  AGENTS.md file.
- A change lives in `openspec/changes/<kebab-id>/`. It holds `proposal.md`,
  `design.md`, `tasks.md` and a `specs/` directory.
- Spec deltas use `## ADDED Requirements`, then `### Requirement: <name>`,
  then `#### Scenario: <name>` with `- **WHEN**` and `- **THEN**` lines.
  `MODIFIED` and `REMOVED` sections work the same way.
- `openspec validate --strict` exits 0 on success and 1 on failure.
- `list`, `show`, `validate`, `status` and `instructions` all accept `--json`.
- `openspec archive <change-id> --yes` merges the deltas into `specs/` and
  moves the change under `changes/archive/`. `--skip-specs` covers a
  tooling-only change.
- Claude Code gets generated slash commands: `/opsx:propose`, `/opsx:apply`,
  `/opsx:explore`, `/opsx:archive`. An extended set needs a profile, set with
  `openspec config profile` and applied with `openspec update`.
- A workflow is a schema, and a schema is editable. `openspec schema fork`
  copies one into `openspec/schemas/<name>/`. That directory holds a
  `schema.yaml` and a `templates/` folder.
- A schema artifact carries an id, an output path and a `requires` list. So
  the artifact set is a dependency graph, not a fixed list.
- `openspec instructions <artifact> --change <id> --json` returns the template,
  the project context and the content of that artifact's dependencies.
- Current version is 1.8.0 on npm.

## What OpenSpec gives you for exploring

You asked whether it beats flat files. Partly.

`openspec view` opens an interactive terminal dashboard over specs and
changes. That is the one interactive surface today.

`openspec status --json` returns the real structure. It reports
`isPlanningComplete`, `applyRequires`, and an `artifacts` array. Each artifact
carries `id`, `outputPath`, `status`, `requires` and `missingDeps`. Text mode
prints it as a checklist, including `[-] tasks (blocked by: design)`.

`openspec show --json` takes `--deltas-only` for a change. For a spec it takes
`--requirements` and `--no-scenarios`.

What it does not have: a dependency graph across requirements, a traceability
matrix, a web UI, or an MCP server. A fuller TUI sits on the roadmap, unbuilt.

So the artifact layer is structured and queryable. The requirement layer is
still markdown that you read. The traceability we want, scenario to proof, is
ours to build. Phase 1 builds it.

Sources: [OpenSpec repo](https://github.com/Fission-AI/OpenSpec) and the
[CLI reference](https://openspec.dev/docs/reference/cli).

## Phase 0: adopt OpenSpec in this repo

1. Install the CLI globally. Run `openspec init` at the monorepo root.
2. Commit `openspec/` and add nothing of it to `.gitignore`. Archived changes
   are the record, so they belong in git.
3. Run `openspec config profile` and pick the extended workflow. Apply it with
   `openspec update`.
4. Read the generated AGENTS.md. Cut anything that repeats `CLAUDE.md`.
5. Add `openspec validate --strict` to the CI gate list in
   `.github/workflows/npm-publish.yml`. It exits 1 on failure, so it gates
   cleanly.
6. Write the first real change through `/opsx:propose`. Use this plan itself
   as the subject, so the tool gets tested on live work.

## Phase 1: make the DoD a schema artifact

The goal is a DoD tree generated from spec deltas, never hand-written twice.

Do not bolt the DoD on beside the change. Make it an artifact OpenSpec knows
about. Then `status` tracks it and `apply` can wait on it.

7. Run `openspec schema fork` on the default schema. Add a `dod` artifact to
   `openspec/schemas/<name>/schema.yaml`. Set its output path to `dod.md` and
   its `requires` list to the specs artifact.
8. Write its template into that schema's `templates/` folder. It is the
   format `packages/dod-guard/src/parser.ts` already parses.
9. Add the `dod` artifact to `applyRequires`. A change then cannot reach
   implementation until its proofs exist.
10. Write the converter. Input is
    `openspec instructions dod --change <id> --json`, which hands over the
    spec deltas as dependency content. Output is the DoD markdown.
11. Map one scenario to one leaf. The `THEN` line becomes the leaf intent.
    Group leaves under their `### Requirement:` heading.
12. A scenario no command can check becomes a draft leaf with a `MANUAL:`
    intent. There is no `manual` predicate, and a draft correctly holds the
    verdict at INCOMPLETE.
13. Register the written file with `dod_import`, which takes `{ path, cwd }`.
    It sits at `openspec/changes/<id>/dod.md`, so `openspec archive` carries
    the proof record along with the change.
14. Decide how a re-generated DoD passes the tamper fingerprint. A spec that
    changes mid-flight rewrites the leaves. Check whether `dod_amend` covers
    this, and extend it if not. Do not weaken the fingerprint.
15. Add `dod-guard trace <change-id>` to `packages/dod-guard/src/cli.ts`. It
    is the closure check described below, and it is where drift surfaces.

## The closure rule

You asked whether everything absent from OpenSpec counts as an assumption.

As a blanket rule, no. Most of a codebase is never in a spec. A rule that
turns every line into an assumption makes the tag mean nothing.

Scope it to behavior instead, and check it at the seam. Two directions:

- Every DoD leaf traces to one scenario. A leaf with no scenario is a proof
  nobody asked for. It is an assumption, and `trace` names it.
- Every scenario reaches one leaf, or is a `MANUAL:` draft. A scenario with
  neither is an unproven claim, and `trace` names that too.

That makes the rule machine-checkable rather than a matter of taste. Both
failures are the same failure, seen from opposite ends.

For code, the rule becomes narrow and usable. Code that depends on behavior no
scenario states earns an `ASSUMPTION:` comment at that line. Code that
implements a scenario does not, because the scenario already says it.

Wire `trace` into the CI gate table in `CLAUDE.md`. It should exit non-zero on
an untraced leaf, and report untraced scenarios without blocking.

## Phase 2: point /interview at OpenSpec

16. Rewrite `/interview` Phase 4. It currently calls `dod_create` with prose
    sections. It should instead write an OpenSpec change, then generate the
    DoD from it.
17. Keep the question floors and the adversarial spec review. Those are the
    parts OpenSpec does not do.
18. Move confirmed answers into requirements and scenarios. Move unconfirmed
    answers into the DoD `open_questions` field. The fields already exist at
    `packages/dod-guard/src/types.ts:171-176`.
19. Add a risk label to each question, Low, Medium or High. Cap clarifying
    questions at 3 per round, so the interview cannot stall.
20. Make the handoff table name `/opsx:apply` as an executor option.

## Phase 3: /step-by-step

This is the primary build tool, so it takes the most care. The orchestrator
shape is right and does not change. What changes is where the plan comes from,
what a worker is told, and what happens at the end.

One correction to an earlier draft of this plan. It said to pass the proof
commands into the briefing. The briefing already does that, at
`skills/step-by-step/SKILL.md:56`. What the briefing lacks is the requirement
the step serves.

21. Make `steps.json` a schema artifact, the same way item 7 does for the DoD.
    Give it `requires: [dod]`. The chain then runs proposal, specs, dod,
    steps, apply, as one dependency graph OpenSpec already tracks.
22. Write the converter from DoD leaves to steps. A leaf's proof command
    becomes the step `verify_cmd`. Its intent becomes the step title.
23. Map a `MANUAL:` draft leaf to a step with `manual_required: true`. Both
    already mean the same thing: a human still owes us something.
24. Add a seventh briefing field, `Requirement`. It carries the scenario the
    step satisfies, `WHEN` and `THEN` verbatim. The research is blunt here.
    Naive TDD instructions raised regressions to 9.94 percent. Naming what to
    verify against cut them by about 70 percent.
25. Add the assumption rule to the briefing. A worker that relies on behavior
    its scenario does not state writes an `ASSUMPTION:` comment at that line.
26. Rework the staleness check. It stats `plan_source` and compares
    `plan_mtime` today (`SKILL.md:24-28`). Under OpenSpec the source is a
    change, so key it off `openspec status --json` instead.
27. Add OpenSpec to the callers list at `SKILL.md:143-145`. A change proposed
    through `/opsx:propose` is a plan producer like the others.
28. Make it commit after each verified step. It writes a commit message today
    and stops (`SKILL.md:163`). The commit is what buys the rollback point.
    Workers own their git practices separately (`SKILL.md:65`), so this
    touches the `step-*` agent definitions too, not the SKILL.md alone.
29. Extend Finishing. On a green integration check, run `dod-guard trace` and
    then `openspec archive <id> --yes`. A DoD that passes is a change that
    shipped.
30. Mirror every one of these into `/cheap-step`. It shares the format and
    adds a `mode` field, so a change here that misses it splits the two.
31. Feed the spec to the adversarial reviewers, not only the diff. A critic
    holding the spec scored far higher than one holding the code alone.

## Phase 4: ASSUMPTION comments and their audit

An `ASSUMPTION:` comment marks code where a guess needs checking later. The
tag is worth nothing without the check, so both land together.

32. Resolve the collision first. The scanner already ships a `todo-marker`
    rule in
    `packages/quality-guard/skills/quality-refactor/scripts/lib/violations.mjs`.
    An `ASSUMPTION:` comment would trip it.
33. Add an `assumption-marker` rule instead. It counts rather than fails, and
    the count enters `.github/quality/quality-baseline.json`. A rising count
    is then visible without blocking work.
34. Write the convention into `~/.claude/CLAUDE.md`. Every non-obvious guess
    about intent or an API gets `ASSUMPTION: <what and why>` at that line.
35. Build the audit. `grep -rn "ASSUMPTION"` finds them. Each hit gets one
    verdict: confirmed and deleted, wrong and fixed, or still open. An
    assumption nobody rechecks is the failure this tag exists to catch.
36. Decide where the audit runs. A skill is the honest fit, because judging
    whether a guess still holds needs reading the code around it.

## Phase 5: general setup, `~/.claude`

37. Add a plan-mode-first rule to `~/.claude/CLAUDE.md`. Skip it for one-line
    diffs. No file mentions plan mode today.
38. Add the assumptions preamble. State assumptions with risk labels before
    coding. Ask up to 3 questions. Never pick silently between readings.
39. Add the two-correction rule. Corrected the same thing twice means `/clear`
    and a fresh brief.
40. Audit total loaded prose. Today it runs about 505 lines: project
    `CLAUDE.md` 206, global `CLAUDE.md` 136, `enforcement.md` 132 and
    `INSTINCTS.md` 31. The research puts the ceiling near 200 lines.
41. Count the new AGENTS.md against that budget. Adopting OpenSpec makes this
    item harder, not easier.

## Dropped, with reasons

- A standalone `decisions.md`. OpenSpec `specs/` is the accepted-decision
  record, and a second file would drift.
- Contract testing tools such as Pact. This monorepo exposes no external HTTP
  API, so they would check nothing.
- GitHub Spec Kit. It competes with OpenSpec and needs Python.
- A flat assumption list. The ETH Zurich study found context files raised cost
  by over 20 percent with no gain in success rate.

## Open risks

- Two sources of truth is the main danger. If anyone hand-edits a generated
  `dod.md`, the spec and the proofs part ways. Item 15 exists to catch that.
- The fingerprint question in item 14 is unresolved. It could turn out to be
  the hardest part of Phase 1.
- OpenSpec is at 1.8.0 and young. Its CLI surface may move. Pin the version
  and read the changelog before upgrading.
- The custom schema in items 7 to 9 rests on docs alone. I have not run
  `openspec schema fork`. Verify the artifact fields before building on them.
- `packages/dod-guard/CLAUDE.md` claims `docs/` holds a DoD format spec and a
  predicate reference. It does not. That directory holds `fix-plan.md`,
  `plans/` and `shortcomings.md`. Fix the claim or write the missing docs.
