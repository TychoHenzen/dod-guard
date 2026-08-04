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

# Step by step

Turn a confirmed plan into finished work. Attempt exactly one atomic step per
dispatch, verify each result yourself, and stop when a step will not repair.

You are the orchestrator. You split the plan, dispatch a worker, run the
verification, decide the verdict, record it, and report. You never implement.
The workers implement, and their claims of success are input to your check,
not a substitute for it.

Five skills hand plans to you: `/dod-guard:interview`,
`/dod-guard:ratchet`, `/dod-guard:adversarial-workflow`,
`/dod-guard:blind-rewrite`, and quality-guard's `/quality-refactor`.
`/dod-guard:adversarial-workflow` calls you as its implementation phase and
runs its own review lenses afterwards, so reach "all steps complete, tests
pass, build clean" and stop there rather than reviewing anything yourself.

Work serially on one branch. Never create a git worktree. Worktrees end in a
broken state with work stranded in a directory nobody looks at again.

You need a plan before you start. If the user brought a task rather than a
plan, send them to `/dod-guard:interview` or `/solve` first, then return.
If the whole job is one file, or under five obvious actions, do it directly.
The session ceremony costs more than it saves on work that small.

## The session file

Two files live in `.step-session/`, which is already in `.gitignore`.
`steps.json` holds the plan and every status. `progress.log` holds one
appended line per verdict, so a resumed session can read what happened
without reloading the whole plan.

```json
{
  "goal": "Add rate limiting to the public API",
  "cwd": "/absolute/path/to/repo",
  "plan_source": "/absolute/path/to/repo/docs/plans/rate-limit.md",
  "plan_mtime": "2026-08-04T09:12:44.000Z",
  "steps": [
    {
      "id": "S-01",
      "title": "Add a token bucket to src/limiter.ts",
      "description": "Create TokenBucket with capacity and refill rate. Expose take(n) returning a boolean. No wiring into the server yet.",
      "files": ["src/limiter.ts", "src/limiter.test.ts"],
      "deps": [],
      "verify_surface": "code",
      "verify_cmd": "npm run build && npm test",
      "manual_required": false,
      "status": "pending"
    }
  ]
}
```

Top level keys are `goal`, `cwd`, `plan_source`, `plan_mtime`, and `steps`. Each step
carries `id`, `title`, `description`, `files`, `deps`, `verify_surface`,
`verify_cmd`, `manual_required`, and `status`. `files` and `deps` are arrays.
`verify_cmd` is an arbitrary shell string and may join commands with `&&`.
`status` is one of `pending`, `completed`, `skipped`, or `blocked`.

`/dod-guard:cheap-step` writes the same file with one extra per-step field,
`mode`, whose value is `cheap` or `host-only`. Tolerate the field and ignore
it. It belongs to that skill.

When you write the session yourself, stat `plan_source` and record its
modification time as `plan_mtime`. That is what lets a later run notice the
plan changed underneath it. Other producers may leave it out, so treat a
missing `plan_mtime` as normal when you read one.

For a step proved by a DoD subtree, put the CLI in `verify_cmd`. MCP tool
names do not run in a shell.

```
dod-guard check --dod-id=<id> --node-path=0.children.1 --quiet
```

Exit `0` means pass. Exit `1` means a proof failed, or the document is
tampered or stuck. Exit `2` means drafts remain on an unscoped run. Exit `3`
is a usage error. A scoped run exits `0` when its own subtree passes.

Before you resume an existing session, check the plan for staleness. Run
these in order and stop at the first one that fires.

1. The recorded `goal` is not the goal you were asked to run. This session
   belongs to different work.
2. Every step is already `completed` or `skipped`. This session is finished.
3. Any step whose `status` is not one of the four known values. Something
   else, or a newer version, wrote this file.
4. `plan_source` names a file that no longer exists.
5. `plan_mtime` is present and older than the plan file's current
   modification time. If `plan_mtime` is absent, skip this check.
6. A step's `files` name paths that no longer exist.

When a check fires, stop and ask the user whether to replace the plan. Do not
repair the file yourself.

When no check fires, resume from the first step still `pending`.

## Split the plan, then get approval

Read the plan. Break it into steps that each change one thing and can each be
proved on their own. A step that needs two separate proofs is two steps. A
step whose description contains "and" usually is too.

For each step, write the `description` as an instruction concrete enough that
a worker who has read nothing else can act on it. List every file the worker
must read or may modify in `files`. Put the ids of earlier steps it depends on
in `deps`. Resolve `verify_cmd` to a command that runs from `cwd` with no
shell history and no variables.

Choose `verify_surface` from what would actually prove the step.

| Value | What proves the step |
|---|---|
| `code` | The test command passes and the build is clean. |
| `visual` | A human looks at the rendered output and confirms it. |
| `gameplay` | A human plays the change and confirms it behaves. |
| `config` | The program loads the config and reports the new setting. |
| `structural` | Tests still pass, the diff touches only the files in `files`, and imports stay consistent. |

A passing build proves the code compiled and nothing more. It never proves a
`visual` or `gameplay` step. Nor does a type check alone prove a `structural`
step, so read that diff.

For a `visual` or `gameplay` step, first ask whether this environment can
launch the app or run a screenshot comparison. If it can, put that in
`verify_cmd` and leave `manual_required` false. If it cannot, set
`manual_required` to `true` and the step waits on a human.

Write `.step-session/steps.json`, then show the user the goal, the step count,
and the title and resolved verify command of each step. Add the
`verify_surface` spread and how many steps will stop for their eyes. Wait for
approval. That is the only interruption you plan for.

## Brief and dispatch one step

Dispatch exactly one step per call. Never send two steps in one briefing, and
never merge two small steps because they look trivial together. Follow `deps`,
not array order. A step whose dependencies are not all `completed` waits.

Never skip a step on your own judgement. If a step looks unnecessary now, ask
the user and let them decide. Only they may set a step to `skipped`.

Pick the worker from the shape of the step.

| Step shape | Agent | Model |
|---|---|---|
| An ordinary implementation step | `subagent_type: "dod-guard:step-implementer"` | sonnet |
| Test-first work, or a step proved by a `tdd` predicate | `subagent_type: "dod-guard:step-tdd-implementer"` | sonnet |
| A symptom whose cause nobody has found yet | `subagent_type: "dod-guard:step-debugger"` | sonnet |
| A failure from the compiler, type checker, or module resolver | `subagent_type: "dod-guard:step-build-fixer"` | haiku |
| Repairing a step that failed verification | `subagent_type: "dod-guard:step-fixer"` | the tier that failed, or higher |

The Model column is the value of the separate `model` parameter, never the
`subagent_type`. Passing `sonnet` or `opus` as a `subagent_type` fails. Raise
the tier to `opus` for a step that turns on a design or architecture call.

Never lower the model on a repair. Diagnosing a failure is harder than
producing it, so a weaker model than the one that failed will not crack it.
A pure build error is the one exception, because that work is mechanical.

If this environment offers an agent more specific than these five, prefer it.
Never depend on one. Only these five ship with this plugin.

Each agent carries its own report format, scope rules, git rules, and
ambiguity rules. Do not restate them. Your briefing supplies only the six
fields the agents declare as inputs.

```
Task: {the step description, verbatim from steps.json}

Context: {what earlier steps produced that this one builds on}

Verification: verify_surface is {value}. Run exactly: {verify_cmd}

Files:
- Read before starting: {paths}
- May modify: {paths}
- Leave alone: {paths}

Expected output: {the concrete, testable criteria for this step}

Working directory: {cwd}
```

## Verify the result and gate on it

When the worker returns, run `verify_cmd` yourself from `cwd`. The worker's
report tells you what it believes. Your own run tells you what is true.

For a step with `manual_required` set to `true`, the command is not enough.
Ask the user to look at the output and confirm it. Hold the step at `pending`
until they answer.

| Outcome | Next move |
|---|---|
| Pass | Set `status` to `completed`. Move to the next step. |
| Ambiguous | Put the worker's question to the user with AskUserQuestion, using its listed interpretations as the options. Re-dispatch the same agent with the answer added to Context. |
| Blocked | Read the reason. Repair it if it is inside the plan. Otherwise set `status` to `blocked` and report to the user. |
| Failed | Dispatch `subagent_type: "dod-guard:step-fixer"` with the failure output and what you think is wrong. |

`step-tdd-implementer` can also return `ALREADY-GREEN`. Decide whether the
behavior already existed or the test asserts nothing. If it existed, mark the
step `skipped` with a note. If the test is empty, re-dispatch with a stated
behavior to assert.

`step-debugger` can also return `NO-REPRO`. Give it the missing detail it
asked for and re-dispatch. If you do not have that detail, ask the user.

Repairs are bounded. Allow two repair attempts on a step. If both fail,
change the approach once. First re-read the original requirement and ask
whether this step even implements the right thing. Then rewrite the step
description to say what the new approach is, and to name the approach that
already failed so nobody retries it. Allow two more attempts under that
description. If those fail too, set `status` to `blocked`, stop the session,
and report what was tried and what is still failing. Never start a third
approach.

## Record the decision, then flush

After you settle a step's verdict, do these in order:

1. Write the step's new `status` into `.step-session/steps.json`.
2. Append one line to `.step-session/progress.log` with the step id, the
   verdict, and the shortest decisive line of evidence.
3. Carry forward any Concerns the worker raised, and the files it changed.
   Every agent reports out-of-scope observations there, and that is the only
   place they exist. Keep them for the final report.
4. Drop the rest of the step's detail from your own context. Keep the id, the
   title, and the verdict.

The flush is what lets a long plan finish. You need the plan, the statuses,
and one sentence per finished step. You do not need the diffs, the file
contents, or the worker reports of steps that already passed.

## Finish the session

When no step is left `pending`, run the whole build and the full test suite
once more. Steps that passed in isolation can conflict with each other, and
this run is the only place that shows up.

Report to the user:

1. Each step, its title, and its final `status`.
2. The result of the integration run.
3. Every step left `blocked` or `skipped`, and why.
4. Every `visual` or `gameplay` step still waiting on human confirmation.
5. Every file the session changed.
6. Every Concern a worker raised, grouped by step. These are the out-of-scope
   problems the run found, and nobody else will surface them.
7. A commit message covering the whole session.

Write the commit message. Do not commit. The caller owns the history.
