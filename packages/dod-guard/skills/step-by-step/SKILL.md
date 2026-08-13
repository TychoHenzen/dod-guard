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

You need a confirmed OpenSpec change. No change means no work. Route to
`/dod-guard:interview` or `/opsx:propose`, then come back. Every session
runs against `openspec/changes/<id>/steps.json` and needs a change id.

Check that file for staleness: wrong goal, every step already done,
unknown status values, or missing `plan_source`. It is stale when
`openspec status --json --change <id>` artifact statuses differ from the
`plan_artifacts` snapshot at generation time. Stale state means asking
the user whether to replace it (regenerate with `dod-guard steps <id>`).
Valid state means resuming from the first `pending` step.

## Three actors, three boundaries

### You (the orchestrator)

- Present the plan for approval before executing anything. Show: goal,
  step count, each title with its `verify_cmd`, a breakdown of
  `verify_surface` types, and a count of the steps a human must confirm.
  This is the only planned interruption.
- Pick the right worker for each step (see dispatch table below).
- Run `verify_cmd` yourself after every worker finishes. A worker's
  self-report informs your judgment. It does not replace the command.
- Hold `manual_required` steps at `pending` until the user confirms.
- Respect `deps`, not array order. A step starts only after all its
  dependencies show `completed`.
- After each verdict: update `steps.json`, keep Concerns and file lists
  for the final report, then drop everything else about that step.
  Carry forward only id, title, and verdict. Also check off the matching
  item in `openspec/changes/<id>/tasks.md` (see Persistence).
- When `verify_cmd` passes, commit the step's changes yourself. That
  commit is the rollback point. A failed or blocked step earns no
  commit. You commit. You never push. Pushing stays a human decision.

### Workers

Each worker gets a briefing with seven fields and nothing else. The
`Requirement` field carries the most weight. Test-first instructions that
never name what correct means left regressions at 9.94 percent. Naming it
cut them by about 70 percent.

```
Task: {step description, verbatim from steps.json}
Context: {what earlier steps produced}
Requirement: {the scenario this step satisfies, its WHEN and THEN lines verbatim}
Verification: {surface type}. Run exactly: {verify_cmd}
Files:
- Read before starting: {paths}
- May modify: {paths}
- Leave alone: {paths}
Expected output: {concrete testable criteria}
Working directory: {cwd}
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

Session bookkeeping lives at `openspec/changes/<id>/steps.json`, committed
like any other spec artifact. There is no other session store.

**steps.json** carries the plan. Top level: `goal`, `cwd`, `plan_source`
set to the change id, `plan_artifacts` (the `artifacts` array from
`openspec status --json --change <id>`), and a `steps` array. Each entry
holds `id`, `title`, `description`, `files` (array), `deps` (array),
`verify_surface`, `verify_cmd` (a shell string where `&&` is valid),
`manual_required` (bool), and `status`. Valid statuses: `pending`,
`completed`, `skipped`, `blocked`. Ignore fields you do not recognize.
`cheap-step` adds `mode` with values `cheap` or `host-only`.

Record each verdict as you go: id, what happened, and the shortest
decisive evidence, folded into the step's own entry rather than a
separate log.

**tasks.md** is the change's own task list at
`openspec/changes/<id>/tasks.md`, in OpenSpec's own checklist format
(`- [ ]` pending, `- [x]` done), one line per `steps.json` entry.

A change that already has a `tasks.md`: match its existing lines to
`steps.json` entries by task text, rather than overwriting it. Append any
step that has no match. A change with none yet: write one from
`steps.json` before the first step starts.

Flip a line to `- [x]` in the same update where you set that step's
`status` to `completed` in `steps.json`. That way `openspec status` never
disagrees with your own record. A `skipped` or `blocked` step stays
`- [ ]`.

## Callers

These skills produce plans you execute: `/dod-guard:interview`,
`/dod-guard:ratchet`, `/dod-guard:adversarial-workflow`,
`/dod-guard:blind-rewrite`, `/quality-refactor`. `/opsx:propose` writes
an OpenSpec change. A later `steps` artifact turns it into the
steps.json you execute.

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
