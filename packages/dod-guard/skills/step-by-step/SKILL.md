---
name: step-by-step
description: >-
  Execute a confirmed multi-step plan one atomic step at a time. Dispatch a
  single worker per step, run the verification yourself, gate on the result,
  record it, and flush the detail before the next step. TRIGGER when: a plan
  has 5 or more steps, a model starts batching steps or cutting corners, the
  user says "work through this step by step" or "do not batch", or the plan
  came out of /interview, /blueprint, or /solve.
argument-hint: "[plan file, .step-session/steps.json, or the plan just confirmed]"

---

# Step-by-step

You are an orchestrator. You dispatch workers, verify their output, and
record results. You never write implementation code.

## Before you start

You need a confirmed plan. No plan means no work. Route to
`/dod-guard:interview` or `/solve` and come back.

Check for `.step-session/steps.json`. When it exists, inspect it for
staleness: wrong goal, every step already done, unknown status values,
missing `plan_source`, or a `plan_mtime` that no longer matches the
source file. Stale state means asking the user whether to replace it.
Valid state means resuming from the first `pending` step.

## Three actors, three boundaries

### You (the orchestrator)

- Present the plan for approval before executing anything. Show: goal,
  step count, each title with its `verify_cmd`, a breakdown of
  `verify_surface` types, and how many steps need manual confirmation.
  This is the only planned interruption.
- Pick the right worker for each step (see dispatch table below).
- Run `verify_cmd` yourself after every worker finishes. A worker's
  self-report informs your judgment. It does not replace the command.
- Hold `manual_required` steps at `pending` until the user confirms.
- Respect `deps`, not array order. A step starts only after all its
  dependencies show `completed`.
- After each verdict: update `steps.json`, append to `progress.log`,
  keep Concerns and file lists for the final report, then drop
  everything else about that step. Carry forward only id, title, and
  verdict.

### Workers

Each worker gets a briefing with six fields and nothing else:

```
Task: {step description, verbatim from steps.json}
Context: {what earlier steps produced}
Verification: verify_surface is {value}. Run exactly: {verify_cmd}
Files:
- Read before starting: {paths}
- May modify: {paths}
- Leave alone: {paths}
Expected output: {concrete testable criteria}
Working directory: {cwd}
```

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

## DoD subtree proofs

Steps verified through a DoD subtree use `dod-guard check` as their
`verify_cmd`. The CLI exits 0 on pass, 1 when a proof failed or the
document is tampered or stuck, 2 when drafts remain on an unscoped
run, and 3 on usage error. A scoped run exits 0 when its own subtree
passes.

## Persistence

All state lives in `.step-session/` (gitignored).

**steps.json** carries the plan. Top level: `goal`, `cwd`,
`plan_source`, `plan_mtime`, and a `steps` array. When you write the
session yourself, stat `plan_source` and record its mtime as
`plan_mtime`. Other producers may leave it absent. Each entry holds `id`, `title`,
`description`, `files` (array), `deps` (array), `verify_surface`,
`verify_cmd` (a shell string where `&&` is valid), `manual_required`
(bool), and `status`. Valid statuses: `pending`, `completed`, `skipped`,
`blocked`. Ignore fields you do not recognize. `cheap-step` adds
`mode` with values `cheap` or `host-only`.

**progress.log** gets one appended line per verdict: step id, what
happened, and the shortest decisive evidence.

## Callers

These skills produce plans you execute: `/dod-guard:interview`,
`/dod-guard:ratchet`, `/dod-guard:adversarial-workflow`,
`/dod-guard:blind-rewrite`, `/quality-refactor`.

Under `adversarial-workflow`: finish at "steps done, tests pass, build
clean" and stop. Do not review further.

## Finishing

After the last step, run the full build and test suite as an
integration check.

Deliver a report containing:

- Each step's title and final status
- Integration check result
- Reasons for any blocked or skipped steps
- Visual or gameplay steps still awaiting confirmation
- All changed files
- All worker Concerns, grouped by step
- A commit message (write it, do not commit)
