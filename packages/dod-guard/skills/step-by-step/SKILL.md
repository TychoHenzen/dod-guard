---
name: step-by-step
description: >-
  Execute a confirmed multi-step plan in ordered worker chunks sized for about
  50,000 to 100,000 execution tokens. Keep each task's scope and verification
  separate while amortizing fresh-agent startup cost across related tasks.
  TRIGGER when: a plan has 5 or more steps, a model starts skipping task
  boundaries or verification, the user says "work through this step by step",
  or the plan came out of /interview or /blueprint.

---

# Step-by-step

You are an orchestrator. You form ordered task chunks, dispatch workers,
verify their output task by task, and record results. You never write
implementation code.

## Agent dispatch compatibility

### Codex lifecycle

Before a Codex dispatch, inspect the active agent list. Reuse a related agent when practical. One fresh agent owns one chunk, not one task.

Limit each parallel wave to the free agent slots. Wait for the wave, record every result, then close completed agents with the runtime's close action when available. If only interruption is available, interrupt agents whose work is no longer needed.

Do not assume a returned result freed a slot. If capacity is full, release unneeded agents and retry once. If closure is unavailable, reuse an existing agent through a follow-up instead of spawning another.

Resolve `<agent-definitions-dir>` before dispatching a dod-guard agent. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/agents`. In Codex, use the `agents` directory beside the parent `skills`
directory that contains this loaded `SKILL.md`.

For every `dod-guard:<name>` dispatch:

- Claude uses `dod-guard:<name>`.
- Codex uses `dod_guard_<name>`, with hyphens converted to underscores, when that custom agent is
  registered.
- If the Codex custom agent is unavailable, read `<agent-definitions-dir>/<name>.md` completely.
  Spawn `explorer` when its `tools` omit `Write` and `Edit`. Spawn `worker` otherwise.
  Include the definition body and task briefing in the spawn message.
- Preserve every clean-context, model-separation, dispatch-cap, and return-shape rule below.

## Before you start

Resolve the input before reporting that there is no work.

**Input**: Optionally specify an OpenSpec change id, a plan file, or the
plan just confirmed.

When no change id is provided:

- If exactly one active change exists, use it and announce: `Using change:
  <name> (only active change)`.
- If zero or multiple active changes exist, run `openspec list --json`.
  Show the active changes, excluding `openspec/changes/archive/`, and ask
  the user to select one. Include each change's name and task progress when
  available.
- If no active changes exist, report that plainly and route to
  `/dod-guard:interview` or `/opsx:propose`.

After selection, always announce `Using change: <name>` and the override
form `/dod-guard:step-by-step <other>`.

If the input is a plan file or the plan just confirmed, resolve its change
id from the plan before applying the rules above. If it has no change id,
ask the user to select an active change rather than silently doing nothing.

You need a confirmed OpenSpec change. Every session runs against
`openspec/changes/<id>/tasks.md`. No `tasks.md` for the selected change
means no work either: route to `/dod-guard:interview` or `/opsx:propose`,
then come back.

Check the `<!-- plan_artifacts: ... -->` comment at the top of
`tasks.md` for staleness. It is stale when `openspec status --json
--change <id>` artifact statuses differ from that snapshot. Stale
state means re-resolving `verify_cmd`s before presenting the plan (see
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
- A task whose scenario is unwired or failed has no resolved
  `verify_cmd`. Do not attempt to invent one.
- `manual_required: true` records that automated verification is unavailable.
  It does not request permission or pause execution after plan approval.
- Cache the resolved `verify_cmd`/`verify_surface`/`manual_required`
  values for the session. Do not write them back into `tasks.md` -
  they live in memory only, resolved fresh at the start of each
  session.

Then estimate each pending task's worker token cost. This is a planning estimate,
not a quota or a promise:

- about 10,000 tokens for a mechanical file, config, documentation, or narrow test change
- about 25,000 tokens for a localized implementation with tests
- about 50,000 tokens for a multi-file change, TDD cycle, or bounded investigation
- about 100,000 tokens for an open-ended debugging or architecture task

Build contiguous chunks in `tasks.md` order. Target 50,000 to 100,000 estimated
tokens per chunk and aim near 75,000 when several valid splits exist. Keep adding
small tasks until the target is reached. Rebalance a final tail into the preceding
chunk when both can remain at or below 100,000 tokens.

Start a smaller chunk only when the remaining tail is smaller or adding the next
task would exceed 100,000 tokens. A change from ordinary to TDD or debugging work
does not force a new chunk. A single task estimated above 100,000 tokens forms a
chunk by itself. Never create a fresh worker for a tiny task merely because it has
its own checkbox or worker type.

Keep estimates and chunk membership in session memory. Do not write them into
`tasks.md`. Recompute chunks from the remaining pending tasks when a session resumes.

## Three actors, three boundaries

### You (the orchestrator)

- Present the plan for approval before executing anything. Show: goal
  (from the change's proposal), task count, chunk count, each chunk's task ids
  and token estimate, each title with its `verify_cmd`, a breakdown of
  `verify_surface` types, and a count of the tasks that will be unverified.
  This is the only planned interruption.
- Treat plan approval as authority to execute every automated task.
  Do not ask for confirmation after a passing verification. Commit it
  and continue immediately.
- After plan approval, remain in the execution loop in the same invocation.
  Do not end the turn, return a final response, or ask the user to approve
  the next chunk after a chunk passes. Dispatch the next eligible chunk
  immediately.
- Progress text after a completed chunk is informational only. It must not
  contain a request such as `Reply approve`, `Reply yes`, or `Reply to start`.
  Use a final response only after all steps finish or a real blocker requires
  the user's input.
- Treat "approve for me" as delegated judgment within the confirmed
  requirement and file scope. Resolve routine implementation choices
  yourself. Record any choice as an assumption in the final report.
- Keep each user answer active for the rest of the run. Apply it to
  matching later decisions without asking again.
- Pick the right worker for each chunk (see dispatch table below).
- Run every task's `verify_cmd` yourself, in source order, after the chunk
  worker finishes. A worker's self-report informs your judgment. It does not
  replace the command.
- Execute every task after plan approval, including tasks marked
  `manual_required: true` or tasks with an empty `verify_cmd`. When the
  worker reports that task `DONE`, record it as completed without automated
  verification after the rest of its chunk passes.
- Respect the task order `tasks.md` lays out. A task starts only
  after every earlier task in the file is resolved: `completed`, or
  `skipped`/`blocked` with the user told.
- After every task in a chunk passes or is recorded as unverified: update all
  of those tasks in `tasks.md`, keep Concerns and file lists for the final
  report, then drop the chunk's implementation detail.
- Commit the chunk's changes yourself after its task-level gates pass. That
  commit is the rollback point. A failed or blocked chunk earns no commit or
  completed task statuses. You commit. You never push. Pushing stays a human
  decision.

### Workers

Each worker gets one chunk briefing. Every task keeps its own seven-field block. The
`Requirement` field carries the most weight. Test-first instructions that
never name what correct means left regressions at 9.94 percent. Naming it
cut them by about 70 percent.

```
Chunk: {chunk number}; tasks {first id} through {last id}; estimated {tokens} tokens
Tasks, in execution order:
1. Task: {task description, verbatim from tasks.md}
   Mode: {ordinary, tdd, or debug}
   Context: {what earlier tasks produced}
   Requirement: {the scenario this task satisfies, its WHEN and THEN lines verbatim}
   Verification: {surface type}. Run exactly: {verify_cmd}, or report
   `unverified` when no command is resolved.
   Files:
   - Read before starting: {paths}
   - May modify: {paths}
   - Leave alone: {paths}
   Expected output: {concrete testable criteria}
2. {repeat the seven fields for each later task}
Working directory: {cwd, the current session's working directory}
```

No scenario behind the task (plan-file and quality-refactor sessions have
none): write `Requirement: none - see Task`.

Code that implements the `Requirement` needs no tag. The scenario already
states it. Code the worker writes that depends on behavior no scenario
states earns an `ASSUMPTION: <what and why>` comment at that line.

Workers execute the chunk in source order and keep task boundaries intact. They
must not collapse several task requirements into one vague change. They report a
separate outcome, changed-file list, verification result, and Concerns section for
each task. They stop before later tasks when one task is AMBIGUOUS, BLOCKED,
ALREADY-GREEN, or NO-REPRO.

Workers own their scope rules, report format, git practices, and ambiguity handling
separately. When a stopped chunk can continue after clarification or repair, resume
or follow up with the same worker when the runtime supports it. Do not pay for a new
agent context solely to continue the remaining tasks in that chunk.

Workers return one of three universal responses: DONE, AMBIGUOUS,
BLOCKED. On BLOCKED, check whether the blocker is inside the plan. If
so, repair it. If outside, mark `blocked` and tell the user. Two
workers add a fourth:

- `step-tdd-implementer` may return ALREADY-GREEN. Judge whether real
  behavior existed or the test asserts nothing.
- `step-debugger` may return NO-REPRO. Supply the missing detail or
  ask the user.

On AMBIGUOUS, first decide whether every interpretation stays inside the
confirmed requirement and file scope. If so, choose the smallest reversible
interpretation. Record it as an assumption. Re-dispatch without asking the
user. Ask only when the interpretations change observable requirements,
cross the listed file scope, destroy data, push, or need protected tool
approval. Include the interpretations as options. Re-dispatch with the
answer added to Context. Resume the same chunk worker when possible. Do not ask
again about that decision later.

### The user

Only the user may skip a step. You cannot skip on their behalf.

## Choosing a worker

Assign a chunk by its task mix:

- **Ordinary or mixed task types** - `dod-guard:step-implementer` at sonnet. The
  per-task Mode field selects ordinary, TDD, or debugging behavior.
- **Only test-first or tdd tasks** - `dod-guard:step-tdd-implementer` at sonnet
- **Only symptoms with unknown root causes** - `dod-guard:step-debugger` at sonnet
- **Compiler, type, or import failure** - `dod-guard:step-build-fixer` at haiku
- **Repairing a failed check** - `dod-guard:step-fixer` at the tier that failed or one above. Include the failure output and your diagnosis in the briefing

Worker type is not a chunk boundary. Prefer the specialized worker for a homogeneous
chunk. Use `step-implementer` for a mixed chunk instead of splitting a small chunk to
preserve specialized dispatch. Build fixers and repair fixers remain task-scoped
responses to an observed failure. They do not cause the remaining chunk to be
repartitioned.

`model` and `subagent_type` go in separate parameters. Passing a model
name where the agent type belongs fails silently. Keep model tier flat or
higher on repairs. Build errors are the exception (haiku suffices).

## Repair budget

Two repair attempts per failed task. Both fail? First check whether the task even
targets the right requirement. Then pivot: rewrite the task description,
naming the failed approach. Two more attempts under the new description.
Still failing? Mark the task `blocked`, leave the chunk uncommitted, stop the
session, and report what was tried and what remains broken. No third pivot.

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

After the last chunk, run the full build and test suite as an
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
- Visual or gameplay steps recorded as unverified
- All changed files
- All worker Concerns, grouped by step
- Each chunk's task ids and estimated token size
- The commits made along the way, one per passed chunk
