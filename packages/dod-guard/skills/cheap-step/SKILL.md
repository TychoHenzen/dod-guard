---
name: cheap-step
description: >-
  Run a confirmed multi-step plan exactly as /dod-guard:step-by-step does, with
  one substitution: each step's implementation goes to the evomcp solve tool,
  which runs cheap DeepSeek workers, instead of to a dispatched host agent. You
  still write the spec and still run the verification. TRIGGER when: a plan has
  5 or more steps and you want implementation to run on the cheap backend, or
  the user says "cheap step", "offload to deepseek", "use the cheap model for
  this", or "delegate the grunt work".
argument-hint: "[OpenSpec change id, plan file, or the plan just confirmed]"
---

# Cheap step

This skill is a delta over `/dod-guard:step-by-step`. Read that skill now and
run it. Everything in it holds here.

## What you inherit

You inherit the whole base discipline. That covers splitting the plan and
getting approval. It covers the session file at
`openspec/changes/<id>/steps.json`, and every field name in it. It covers the
staleness checks, dependency order, and the four statuses. It covers the
verdict gate, the repair cap, and the record-and-flush step. It covers the
closing integration run and the final report.

Do not restate any of it. When you need a rule from that list, read the base.

One thing changes. Where the base dispatches an agent with the Task tool, you
call the evomcp `solve` tool instead. You still write the instruction, you
still run `verify_cmd` yourself, and you still decide the verdict.

Before you start, call the evomcp `status` tool. If the proxy is not running
and no key is configured, say so and run the base instead.

`solve`, `evolve`, `orchestrate` and `status` are MCP tools. Never put one in
a shell command or a `bash` fence. It is the same trap as `dod_check` against
`dod-guard check`. The first is an MCP tool name. The second is the CLI.

## When the trade pays, and which steps qualify

The saving is arbitrage between host tokens and backend tokens. A spec the
worker can act on costs host tokens up front. That overhead buys nothing on a
cheap host model. Run the base instead in that case.

Record the choice per step in `steps.json` as `mode`, valued `cheap` or
`host-only`. That is the only field you add. Rename nothing else.

| Step | `mode` | Why |
|---|---|---|
| `verify_surface` is `visual` or `gameplay` | `host-only` | The worker cannot look at rendered output. |
| The step turns on a design or architecture call | `host-only` | That judgement is not delegable. |
| The step touches auth, secrets, crypto, permissions, or input the network reaches | `host-only` | A passing test does not prove this class safe. |
| The step lists more than 3 files, or its check runs a whole suite | split it, or `host-only` | Too wide to state fully in a spec the worker cannot query. |
| Everything else | `cheap` | A narrow command can prove it. |

Report the `mode` split when the base asks the user to approve the plan. The
user should see how many steps go to the cheap backend before the run starts.

Secure the working tree before the first dispatch. `solve` creates branches and
checks them out in this directory, and it discards the attempts that lose.
Commit or stash anything you are not willing to lose.

The base commits after each step whose `verify_cmd` passes. That commit
lands on whatever branch is checked out at that moment. After `solve`
returns, confirm you are back on the session's branch before the base
commits. A commit on a branch `solve` leaves behind is not on the branch
the rest of the session builds on.

Two keys hold the same paths and are not the same key. `allowed_files` is the
`solve` spec field. `files` is the session step field.

## Settle every question before you write a spec

The base can dispatch a step and get `AMBIGUOUS` back, because its agents have
a report format for that. A `solve` worker has no such channel. It cannot ask.
It will pick a reading and build it.

1. Re-read the step description and name every point where two readings fit.
2. Ask the user with AskUserQuestion, one question per point.
3. Write each answer into the step `description` in `steps.json`, so a retry
   never re-asks.

Confirm the check is stable too. Run `verify_cmd` twice before you dispatch. A
worker cannot second-guess a flaky command. It will chase the noise and burn
the whole retry budget. Replace a flaky command with a narrow stable one, or
move that step to `host-only`.

## Write the spec

`solve` takes exactly one argument, named `spec`. Never pass loose keyword
arguments. Required fields are `goal`, `verify_cmd` and `cwd`. Optional fields
are `budget_tokens`, `fanout`, `allowed_files`, `strategy` (`"auto"`,
`"best-of-n"` or `"evolve"`), `context`, `model`, `api_key`, `build_cmd`,
`test_cmd`, `lint_cmd` and `held_out_tests`.

The spec is the worker's whole world. Write it this way:

1. State the observable outcome in `goal`, never the method.
2. Point `verify_cmd` at the narrowest command that exits non-zero on failure.
3. Open `context` with `Requirement: {the scenario's WHEN and THEN lines
   verbatim}`. No scenario behind this step: write `Requirement: none - see
   Task`. A `solve` worker has no briefing to read this from, so it belongs
   in `context` or it never reaches the worker at all.
4. After the requirement line, name one existing file to copy the pattern
   from in `context`, plus the constraints. One paragraph, not a dumped
   file. Code that implements the requirement needs no tag. Code the
   worker writes that depends on behavior no scenario states earns an
   `ASSUMPTION: <what and why>` comment at that line.
5. List every file the worker may touch in `allowed_files`.
6. Set `cwd` to the session `cwd`, as an absolute path.
7. Set `budget_tokens` per step. Left out, it defaults to about 100k, which is
   far more than one atomic step needs. An uncapped step spends the saving
   this skill exists to produce.

For a step proved by a DoD subtree, `verify_cmd` uses the CLI:
`dod-guard check --dod-id=<id> --node-path=0.children.1 --quiet`. Exit `0`
passes. Exit `1` means a proof failed, or the document is tampered or stuck.
Exit `2` means drafts remain on an unscoped run. Exit `3` is a usage error. A
scoped run exits `0` when its own subtree passes, which is what makes a subtree
usable here.

```json
{
  "goal": "TokenBucket.take(n) returns false once the bucket is empty and true again after one refill interval",
  "verify_cmd": "npx vitest run src/limiter.test.ts",
  "cwd": "/absolute/path/to/repo",
  "allowed_files": ["src/limiter.ts"],
  "context": "Requirement: WHEN take(n) is called on an empty bucket THEN it returns false. WHEN one refill interval has passed THEN it returns true again. src/limiter.test.ts already exists and is red. Copy the timer handling in src/backoff.ts. Use a monotonic clock. Add no dependencies.",
  "strategy": "best-of-n",
  "fanout": 4,
  "budget_tokens": 30000,
  "build_cmd": "npm run build"
}
```

A weak spec says `goal: "fix rate limiting"`, sets `verify_cmd` to the whole
suite, leaves `context` empty, and omits `allowed_files`. The worker then
guesses the behavior, reads failures it did not cause, and edits any file.

## Check the work, then retry or take the step yourself

Run `verify_cmd` yourself from `cwd`. Then read the diff. A passing command
plus an unread diff is not a verified step. A cheap worker can pass a narrow
check by degenerate means. Look for all five:

1. A special case that matches the test input.
2. A weakened or deleted assertion.
3. A file edited outside `allowed_files`.
4. A catch block that swallows the error and returns a default.
5. Commented-out code where the failure was.

A narrow `verify_cmd` proves the step and nothing around it. So after the diff
reads clean, run the build and the tests for the modules this step touched.
Waiting for the base's closing run buries the breakage many steps deep.

On failure, never re-send the same spec. Add what failed and what the attempt
got wrong.

- Vague: "that did not work, try again".
- Specific: "take(0) returned false. The test asserts true for a zero-cost
  draw. Do not change the test. The bug is the `<=` in the capacity check."

Allow two retries. If the second fails, do the step on the host yourself. Read
whatever partial work came back first, then dispatch through the base's normal
agent table. Set `status` to `completed` and leave `mode` as `cheap`. Note in
the step's own entry that the host finished it. Invent no new status value.

Count those lines as you go. Once more than 30 in every 100 cheap steps end on
the host, stop. This plan does not suit cheap workers. Say so, and finish the
run under the base.

A `solve` call can also fail because the backend died mid-run. Two failures
that never reached a verify result mean the proxy, not the plan. Call `status`
again. If it is down, tell the user at once and switch to the base. Do not
grind through the rest of the plan on the host without saying so.
