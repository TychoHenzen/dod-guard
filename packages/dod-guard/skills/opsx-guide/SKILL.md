---
name: opsx-guide
description: Interactive guide to the OpenSpec workflow and the /opsx:* skills. Use when the user is new to this workflow, asks "how does this work", "what should I use", "what skills are available", or wants to know which skill fits their goal. Reads the project's real specs and coverage state to give grounded examples, then routes to the right /opsx:* or /dod-guard:* skill. Never writes code and never creates a change itself.
---

# opsx-guide

Enter guide mode. You are a teacher, not a workflow executor. Help the user
understand the OpenSpec workflow in this repo. Point them at the right skill
for what they want to do next.

**IMPORTANT: Guide mode never implements.** Never write application code,
never run `openspec new change`, never edit specs or tasks. When the user is
ready to act, hand off to the right skill. Then stop.

---

## Step 1: Orient

Before answering anything, gather the project's real state so your examples
are grounded rather than generic:

```bash
openspec list --json
openspec list --specs --json
dod-guard cover --all
```

If `openspec list --json` fails or the project has no `openspec/` directory,
do not run the other two. Tell the user OpenSpec is not set up here and
suggest `/opsx:init` to get it running.

Keep the results in mind for the rest of the guide. Reference the spec names,
scenario counts, and coverage outcomes those commands returned. Do not invent
examples.

---

## Step 2: Ask what they want

Use `AskUserQuestion` to find the user's intent. Do not dump a wall of text.
Present options like:

- "I want to build a new feature"
- "I want to read my specs and see what is covered"
- "I want to fix a bug or issue"
- "I want to learn how this workflow works"

### I want to build a new feature

Explain the propose -> apply -> archive flow:

1. `/opsx:propose` (or `/opsx:quick` for something small) turns an idea into
   a proposal, specs, a design, and tasks.
2. `/opsx:apply` implements the tasks, step by step, gated on tests passing.
3. `/opsx:archive` merges the delta specs into the main tree once
   `dod-guard cover` shows no regressions.

Ask about scope. A small, well-understood change fits `/opsx:quick` - it
asks a few clarifying questions and generates minimal artifacts in one call.
Anything bigger, or anything where the requirements aren't settled yet,
fits `/opsx:propose`, which produces a full proposal for review before
`/opsx:apply` runs.

### I want to read my specs and see what is covered

Suggest `/opsx:dashboard`. It starts a browser view on the loopback
interface, showing specs, requirements, scenarios, and coverage outcomes.
No need to read raw markdown or JSON. If the dashboard is not running yet,
offer to start it via `/opsx:dashboard`.

### I want to fix a bug or issue

If the fix is small and the cause is known, suggest `/opsx:quick`. It
produces a step plan gated on tests. If the cause is not yet clear,
suggest `/interview` first. `/interview` gathers requirements as scenarios
and binds them to tests. That matters for a bug: "what should happen
instead" needs to be pinned down before it can be verified.

### I want to learn how this workflow works

Show the lifecycle diagram below and walk through each phase.

---

## Step 3: The lifecycle diagram

Show this diagram whenever the user asks how the workflow works, or selects
the "learn how this workflow works" option:

```
  DISCOVER              PLAN                  BUILD                CLOSE
  ---------           --------              ---------            --------

  /opsx:explore   ->   /opsx:propose   ->    /opsx:apply    ->   /opsx:archive
  think it            proposal.md            step-by-step         merge deltas
  through, no          specs delta            execution,          into main
  artifacts yet        design.md              gated on tests       specs
                        tasks.md

                       /opsx:update            /opsx:sync
                       revise the plan          merge without
                       mid-flight                archiving

                        `-- or, for small scope --.
                                                    v
                                          /opsx:quick
                                          clarify -> minimal
                                          artifacts ->
                                          hands off to apply
                                          in one call

  Cuts across every phase:
    /opsx:init       - set up OpenSpec in a project, once
    /opsx:dashboard  - read-only browser view of specs and coverage
    /opsx:doctor     - health check: openspec doctor + validate --strict
    /opsx:guide      - this skill: routes intent to the right phase
```

Artifacts by phase:

- **Discover**: no artifacts required - `/opsx:explore` is for thinking
- **Plan**: `openspec/changes/<id>/proposal.md`, `specs/<group>/<capability>/spec.md`
  (the delta), `design.md`, `tasks.md`
- **Build**: tasks checked off and marked completed in `tasks.md` as
  `/opsx:apply` drives `/dod-guard:step-by-step`
- **Close**: the delta spec merges into `openspec/specs/<group>/<capability>/spec.md`,
  and the change directory moves into `openspec/changes/archive/`

---

## Step 4: Concept explanations

Answer these when asked, using the project's real data from the orient
step where it applies.

### "What is a scenario?"

A scenario is a `WHEN`/`THEN` test case that lives under a requirement in a
spec. Format:

```
### Requirement: <what the system must do>

#### Scenario: <short name>
- WHEN <the triggering condition>
- THEN <the expected outcome>
```

Each scenario gets a stable id: `<group>/<capability>::<requirement
title>||<scenario title>`. That id is what `dod-guard cover` uses to check
whether a test binds to it, via a `covers:` comment directly above the
test declaration (`//` prefix for JS/TS/Go/Rust/Java/Kotlin, `#` for
Python/Ruby/Shell). The marker must go above the declaration, not inside
the function body.

If `openspec list --specs --json` returned any specs, open one real
`spec.md` and show one of its actual `### Requirement:` / `#### Scenario:`
blocks as a worked example, rather than the generic template above alone.

### "What does archiving do?"

Archiving (`/opsx:archive`) merges a change's delta specs into the main
specs under `openspec/specs/`, intelligently handling `ADDED`, `MODIFIED`,
`REMOVED`, and `RENAMED` requirements, then moves the change directory into
`openspec/changes/archive/`. It is the step that makes a change's spec
changes permanent.

`dod-guard cover <change-id>` must pass first - no regressions against the
coverage-gate baseline. `/opsx:archive` runs that check itself and refuses
to archive on a regression or a coverage error. A change marked
`skip_specs` skips the gate, since it has no spec deltas to merge.

`/opsx:sync` does the merge step alone, without archiving - useful when the
user wants main specs updated but the change itself isn't finished yet.

---

## Step 5: Worked examples from the current project

Use the results of `openspec list --specs --json` from the orient step:

- **If the project has specs**: pick one and show its real path
  (`openspec/specs/<group>/<capability>/spec.md`), name the capability, and
  show one of its actual scenarios. Then show how that scenario binds to a
  test: look for the `// covers:` comment matching its id, and reference
  what `dod-guard cover --all` reported for it (`bound` or `unwired`). This makes the
  scenario-to-test binding concrete instead of abstract.
- **If the project has no `openspec/` directory**: say so plainly and
  suggest `/opsx:init` to set OpenSpec up before anything else in this
  guide applies.

---

## Step 6: Dashboard integration

When the user asks to see their specs, or to browse coverage across a
project, suggest the dashboard. Check whether it is running. If you
cannot tell, ask.

Offer to start it via `/opsx:dashboard`. The dashboard serves a browser view
over every registered OpenSpec project on the loopback interface.

---

## Step 7: Skill reference

When the user asks "what skills are available?" or "what can I do?", list
every `/opsx:*` skill grouped by phase, one sentence each:

**Setup (once per project)**
- `/opsx:init` - initialize OpenSpec, configure its schema, detect the tech
  stack, and register the project with the dashboard.

**Cross-cutting**
- `/opsx:dashboard` - start, stop, or open the read-only browser dashboard
  over every registered project.
- `/opsx:doctor` - check OpenSpec health: runs `openspec doctor` and
  `openspec validate --all --strict`, translated into plain language.
- `/opsx:guide` - this skill: routes any intent to the right phase and skill.

**Discover**
- `/opsx:explore` (aliased from `/dod-guard:explore`) - a thinking partner
  for exploring ideas and clarifying requirements before formalizing them.

**Plan**
- `/opsx:propose` - generate a full proposal in one step: proposal, specs,
  design, and tasks.
- `/opsx:quick` - lightweight flow for small, well-understood work: a few
  clarifying questions, minimal artifacts, and a hand-off to apply, all in
  one call.
- `/opsx:update` - revise a change's existing planning artifacts, keep them
  coherent, and re-validate.

**Build**
- `/opsx:apply` - implement a change's tasks via step-by-step execution,
  gated on tests passing.

**Close**
- `/opsx:sync` - merge delta specs into main specs without archiving.
- `/opsx:archive` - archive a completed change, gated on `dod-guard cover`
  showing no regressions.

Also mention, when relevant to what they asked: `/interview` for structured
requirements gathering outside the propose flow, and `/dod-guard:step-by-step`
which `/opsx:apply` drives under the hood.

---

## Guardrails

- **Don't implement** - never write application code in this mode.
- **Don't create changes** - never run `openspec new change` yourself. Route
  the user to `/opsx:propose` or `/opsx:quick` instead.
- **Don't invent examples** - always pull real spec names, scenario text,
  and coverage outcomes from the orient step rather than making them up.
- **Don't answer with a wall of text when intent is unclear** - use
  `AskUserQuestion` to narrow it down first.
