---
name: step-by-step
description: >-
  Execute a confirmed multi-step plan one atomic step at a time. Dispatch a
  single worker per step, run the verification yourself, gate on the result,
  record it, and flush the detail before the next step. TRIGGER when: a plan
  has 5 or more steps, a model starts batching steps or cutting corners, the
  user says "work through this step by step" or "do not batch", or the plan
  came out of /interview, /blueprint, or /solve.
argument-hint: "[OpenSpec change id, plan file, or the plan just confirmed]"

---

# Step-by-step

You are an orchestrator. You dispatch workers, verify their output, and
record results. You never write implementation code.

## Before you start

You need a confirmed OpenSpec change. No change means no work. Every
session runs against `openspec/changes/<id>/tasks.md` and needs a
change id. No `tasks.md` for that change means no work either: route to
`/dod-guard:interview` or `/opsx:propose`, then come back.

Check the `<!-- plan_artifacts: ... -->` comment at the top of
`tasks.md` for staleness. It is stale when `openspec status --json
--change <id>` artifact statuses differ from that snapshot. Stale
state means asking the user whether to re-resolve `verify_cmd`s (see
Startup). Valid state means resuming from the first uncompleted task
(`- [ ]` with no `blocked`/`skipped` status).

## Startup

Resolve every task's `verify_cmd` once, in memory, before presenting
the plan.

- Parse `tasks.md` into task items, each with its `<!-- covers: -->`
  annotation if present.
- For each task carrying a `covers` annotation, run `dod-guard cover
  <change-id>` and look up that scenario's outcome. A covered outcome
  gives its bound test's whole-file run command as the task's
  `verify_cmd`, and `verify_surface` of `code` unless the task's own
  `<!-- verify_surface: -->` annotation says otherwise.
- A task whose scenario is unwired or failed, and any task with no
  `covers` annotation at all, is `manual_required`. Do not attempt to
  invent a `verify_cmd` for it.
- Cache the resolved `verify_cmd`/`verify_surface`/`manual_required`
  values for the session. Do not write them back into `tasks.md` -
  they live in memory only, resolved fresh at the start of each
  session.

## Three actors, three boundaries

### You (the orchestrator)

- Present the plan for approval before executing anything. Show: goal
  (from the change's proposal), step count, each title with its
  `verify_cmd`, a breakdown of `verify_surface` types, and a count of
  the steps a human must confirm. This is the only planned
  interruption.
- Pick the right worker for each step (see dispatch table below).
- Run `verify_cmd` yourself after every worker finishes. A worker's
  self-report informs your judgment. It does not replace the command.
- Hold `manual_required` steps at `pending` until the user confirms.
- Respect the task order `tasks.md` lays out. A step starts only
  after every earlier task in the file is resolved: `completed`, or
  `skipped`/`blocked` with the user told.
- After each verdict: update `tasks.md`, keep Concerns and file lists
  for the final report, then drop everything else about that step.
  Carry forward only id, title, and verdict (see Persistence).
- When `verify_cmd` passes, commit the step's changes yourself. That
  commit is the rollback point. A failed or blocked step earns no
  commit. You commit. You never push. Pushing stays a human decision.

### Workers

Each worker gets a briefing with seven fields and nothing else. The
`Requirement` field carries the most weight. Test-first instructions that
never name what correct means left regressions at 9.94 percent. Naming it
cut them by about 70 percent.

```
Task: {step description, verbatim from tasks.md}
Context: {what earlier steps produced}
Requirement: {the scenario this step satisfies, its WHEN and THEN lines verbatim}
Verification: {surface type}. Run exactly: {verify_cmd}
Files:
- Read before starting: {paths}
- May modify: {paths}
- Leave alone: {paths}
Expected output: {concrete testable criteria}
Working directory: {cwd, the current session's working directory}
```

No scenario behind the step (plan-file and quality-refactor sessions have
none): write `Requirement: none - see Task`.

Code that implements the `Requirement` needs no tag. The scenario already
states it. Code the worker writes that depends on behavior no scenario
states earns an `ASSUMPTION: <what and why>` comment at that line.

Workers own their scope rules, report format, git practices, and
ambiguity handling separately.

Workers return one of three universal responses: DONE, AMBIGUOUS,
BLOCKED. On BLOCKED, check whether the blocker is inside the plan. If
so, repair it. If outside, mark `blocked` and tell the user. Two
workers add a fourth:

- `step-tdd-implementer` may return ALREADY-GREEN. Judge whether real
  behavior existed or the test asserts nothing.
- `step-debugger` may return NO-REPRO. Supply the missing detail or
  ask the user.

On AMBIGUOUS: surface the question to the user via AskUserQuestion,
with the worker's interpretations as options. Re-dispatch with the
answer added to Context.

### The user

Only the user may skip a step. You cannot skip on their behalf.

## Choosing a worker

Match the step to its agent:

- **Ordinary change** - `dod-guard:step-implementer` at sonnet
- **Test-first or tdd predicate** - `dod-guard:step-tdd-implementer` at sonnet
- **Symptom with unknown root cause** - `dod-guard:step-debugger` at sonnet
- **Compiler, type, or import failure** - `dod-guard:step-build-fixer` at haiku
- **Repairing a failed check** - `dod-guard:step-fixer` at the tier that failed or one above. Include the failure output and your diagnosis in the briefing

`model` and `subagent_type` go in separate parameters. Passing a model
name where the agent type belongs fails silently. Keep model tier flat or
higher on repairs. Build errors are the exception (haiku suffices).

## Repair budget

Two attempts per step. Both fail? First check whether the step even
targets the right requirement. Then pivot: rewrite the step description,
naming the failed approach. Two more attempts under the new description.
Still failing? Mark `blocked`, stop the session, and report what was
tried and what remains broken. No third pivot.

## Verification surfaces

`code` and `config` can be checked by running the command alone.
`structural` also requires reading the diff to confirm changes stayed
within the step's `files` list and imports remain consistent. `visual`
and `gameplay` need human eyes or a screenshot comparison. A green
build proves the compiler ran, nothing more.

## Persistence

Session bookkeeping lives entirely in `openspec/changes/<id>/tasks.md`,
committed like any other spec artifact. There is no other session
store, and no separate execution-plan file.

Each task is a single `- [ ]` / `- [x]` checkbox line. Inline metadata
follows as HTML comments directly beneath it:

```
- [ ] 1.1 Add the parser for inline metadata
<!-- covers: dod-guard/step-by-step :: verify_cmd resolved at startup :: annotated task gets verify_cmd from cover -->
<!-- status: pending -->
<!-- verify_cmd: node --experimental-test-module-mocks --test packages/dod-guard/dist/openspec/tasks-parser.test.js -->
<!-- verify_surface: code -->
<!-- manual_required: false -->
```

`<!-- covers: ... -->` names the scenario, written by the plan's
author. `<!-- verify_cmd: -->` and `<!-- verify_surface: -->` may be
pre-filled by the plan's author too, but Startup resolves them fresh
every session and this skill never writes them back to disk.
`<!-- status: -->` is the one field this skill writes, and it holds
the bare status word only: `pending`, `completed`, `skipped`, or
`blocked`.

Checked (`- [x]`) means `completed`. Unchecked (`- [ ]`) covers
`pending`, `blocked`, and `skipped` alike - tell those three apart by
the `<!-- status: -->` comment, never by the checkbox alone.

The task's own id, title, and verdict carry forward in your working
memory for the final report (see Finishing) - `tasks.md` has no slot
for verdict evidence, so do not write it there. Flip the checkbox to
`- [x]` in the same update where you set `status: completed`. That way
`openspec status` never disagrees with your own record. A `skipped` or
`blocked` task keeps its checkbox at `- [ ]`.

The `<!-- plan_artifacts: ... -->` comment near the top of `tasks.md`
stores the staleness snapshot: the `artifacts` array from `openspec
status --json --change <id>` at the time `verify_cmd`s were last
resolved. Startup compares against it (see "Before you start").

## Callers

These skills produce plans you execute: `/dod-guard:interview`,
`/dod-guard:ratchet`, `/dod-guard:adversarial-workflow`,
`/dod-guard:blind-rewrite`, `/quality-refactor`. `/opsx:propose` writes
`tasks.md` and the skill reads it directly.

Under `adversarial-workflow`: finish at "steps done, tests pass, build
clean" and stop. Do not review further.

## Finishing

After the last step, run the full build and test suite as an
integration check.

A green integration check earns two more commands, run in this order.

Run `dod-guard cover <change-id>`. It checks each scenario in the
change's spec deltas against a ratcheted baseline. Exit 0 means every
scenario matches or improves on the baseline. Exit 1 means one
regressed. Exit 3 means usage error. On exit 1 or exit 3, stop here:
report the regression and do not archive.

On exit 0, run `openspec archive <change-id> --yes`. It merges the
change's spec deltas into openspec/specs/ and moves the change under
changes/archive/. Use `--skip-specs` for a tooling-only change with no
spec deltas. Run archive without asking the user first. A change that
passes cover is a change that shipped. Asking for confirmation on
every green run just re-asks a question the gate already answered.
Archiving is not cheaply reversible, but the cover check is the
approval: it already proved every scenario holds before this command
runs.

Deliver a report containing:

- Each step's title and final status
- Integration check result
- Cover and archive outcome
- Reasons for any blocked or skipped steps
- Visual or gameplay steps still awaiting confirmation
- All changed files
- All worker Concerns, grouped by step
- The commits made along the way, one per passed step
