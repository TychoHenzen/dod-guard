---
name: ratchet
description: Execute an existing Definition of Done autonomously, one sub-problem per loop iteration, until a full dod_check passes. Use when a problem has interdependent sub-problems, unknown unknowns, or real regression risk, and a single-shot attempt would waste tokens on wrong approaches. It needs a dod_id that already exists. It does not gather requirements and it does not build the DoD tree. Every iteration proves one sub-problem and then re-runs the whole document, so earlier work cannot silently break. It captures branches with gitevo and persists lessons at the end. Triggers - "solve with ratchet", "ratchet this", "ratcheting workflow", "run the DoD autonomously", "loop until the DoD passes".
---

# Ratchet

## 1. Routing

Decide in the first two minutes.

| What you have | Where it goes |
|---|---|
| No `dod_id` yet | `/dod-guard:interview` first, then return here |
| A linear plan, or fewer than 5 steps | `/dod-guard:step-by-step` |
| A linear plan you want run by cheap workers | `/dod-guard:cheap-step` |
| Quality or security gates needed at each stage | `/dod-guard:adversarial-workflow` |
| Interdependent sub-problems plus regression risk | stay here |

`/dod-guard:interview` owns requirements, the tree, the company baseline, the
five-lens review, `dod_create`, and the pre-code baseline run. Never redo any of
that here. If the tree looks wrong, send the user back to that skill.

## 2. Setup

Run these before any autonomous execution. Read-only work and checkpoints only.

1. Call `memory_recall` with the problem in your own words to find prior attempts.
2. Call `evo_lessons` to read what earlier branches learned about this code.
3. Call `get_impact_radius_tool` on the modules the DoD names, to see the blast
   radius. Call `get_minimal_context_tool` for the files you will edit.
4. Call `dod_tree` with the `dod_id` and read every node. Call `dod_status` for
   the last recorded verdict, and `evo_summary` if a run started earlier.
5. Probe which servers answer. Call `status()` for evomcp and `dod_list()` for
   dod-guard. Tell the user what is missing and read section 7 for what that
   costs. Never degrade in silence.
6. Name the sub-problems. Each one is a task group in the existing tree, with a
   `node_path` you can pass to a scoped check.
7. Order the sub-problems by dependency. A group whose output another group
   consumes goes first. Record the order as a numbered list.
8. Call `evo_init`, then `evo_checkpoint` with a name like `baseline` and a
   description of the starting state.
9. Show the user the ordered list and ask for approval.

Do not start Phase B until the user approves the order. State the count of
sub-problems, the first one you will attempt, and the branch name you will use.

### Proof commands run on the host OS

You will author commands in step 2 of the iteration. Write them for the machine
this runs on, not for a generic shell.

On Windows, use `findstr` rather than `grep`, and write backslash paths.
cmd.exe does not expand file globs. dod-guard expands directory globs such as
`packages/*/` on Windows, but never file globs, so write file paths in full.

Prefer `exit_code` over `output_contains` for a test runner. Node's TAP output
carries no "tests pass" string, so a substring match there passes or fails for
the wrong reason.

## 3. Phase B: the loop

Start `/loop` with the iteration prompt as its argument. A bare `/loop` only
prints usage and never enters dynamic mode.

Each iteration handles exactly one sub-problem and then calls `ScheduleWakeup`
to queue the next one. Iterations never overlap, so never schedule two. Context
carries forward across iterations, so record decisions in the conversation
rather than re-deriving them.

Set `delaySeconds` between 60 and 120 while you are working sub-problems. Set
300 or more when you are waiting on something outside the repository. An
iteration that ends without calling `ScheduleWakeup` gets one fallback wakeup
after roughly 20 minutes, and then the loop dies. Always schedule.

To end the loop deliberately, call `ScheduleWakeup` with `stop=true`.

The rule that makes this a ratchet: an iteration is finished only when the
scoped subtree passes and a full unscoped `dod_check` still passes. Never accept
a green subtree while another subtree has regressed.

## 4. The iteration prompt

Pass this block forward on every cycle. Fill the two placeholders first.

```
Sub-problem: <title and node_path from the approved order>
DoD: <dod_id>

1. Call evo_spawn with the last good checkpoint name and a new_branch named
   after this sub-problem. Work only on that branch.
2. Call dod_tree with the dod_id and this node_path. Read every leaf under it.
   Concretize any draft leaf that is now writable with dod_refine, using
   mode "concretize" for a proof or mode "subdivide" for children. Leave any
   draft whose intent starts with MANUAL: alone.
3. Implement the sub-problem. Write the failing test first when a leaf carries
   a tdd predicate.
4. Verify the subtree:
   dod-guard check --dod-id=<dod_id> --node-path=<node_path> --quiet
   Exit 0 passes. Exit 1 means a proof failed. Exit 2 means drafts remain.
   Exit 3 means you wrote the command wrong.
5. On exit 1 or 2, repair and re-run step 4. Cap this at 3 repair attempts.
6. Run the project formatter over the changed files. A stale format reads as a
   regression in the next step.
7. Run the regression check: dod_check with the dod_id and no nodePath. Any
   leaf outside this sub-problem that now fails is a regression. Fix the
   regression before anything else. It never justifies changing that leaf.
8. Call evo_checkpoint with the sub-problem name and what changed.
9. Call evo_learn with one sentence on what worked or what failed.
10. Call ScheduleWakeup for the next sub-problem in the approved order.

Stop conditions, checked in this order:
- Every concrete leaf passes and only MANUAL: drafts remain: go to section 6.
  dod_check reports INCOMPLETE here, not PASS. That is the success state.
- A proof is failing after 3 repair attempts: escalate, see section 5.
- dod_check reports STUCK: escalate, see section 5.
- The approved order is exhausted and a concrete leaf still fails: escalate.
- Three sub-problems in a row escalated with no progress: stop the loop and
  hand the whole problem back to the user.

If the approach itself is wrong rather than merely stuck, call evo_abandon
with the checkpoint and a reason, then move to the next sub-problem.

Escalation trigger: you are about to weaken a command, loosen a predicate,
delete an assertion, or mark a leaf advisory to make it pass. Stop instead and
escalate.
```

## 5. When a sub-problem will not pass

Cap repair attempts at 3 per sub-problem. After the third, stop and report to
the user. Give the sub-problem name, the failing leaf, the exact command output,
the three approaches you tried, and what you believe the real obstacle is.

Never make a check pass by weakening it. `dod_amend` exists for a proof that was
authored wrong, not for a proof that is inconvenient. It requires `reason`, and
after a node has been amended three times you must also pass
`amend_justification`. dod-guard returns a STUCK verdict on a node amended three
or more times, which overrides a pass. Treat STUCK as a signal that the approach
is wrong, re-read the requirements, and ask the user.

There is no human-verification predicate. A step only a person can judge stays a
draft leaf whose `intent` starts with `MANUAL:`. Collect those and hand them to
the user at the end.

## 6. Finish

Finish when every concrete leaf passes. A DoD built the intended way always
carries `MANUAL:` drafts, so `dod_check` returns INCOMPLETE rather than PASS,
and the CLI exits 2. Read that as done, not as a failure. Only a failing
concrete leaf, which exits 1, blocks the finish.

1. Add a regression proof for each edge case the run turned up. Call
   `dod_add_node` with the `parent_path` and a `refinement` of `"concrete"`.
   This is how the ratchet gains a tooth from what the run learned.
2. Call `evo_adopt` with the winning branch, then `evo_finish`.
3. Call `evo_export_lessons`, then `memory_save` with `type: "project"` and the
   exported content.
4. Report the passing leaf count, the branches you abandoned, and every
   `MANUAL:` leaf the user still owes.
5. Call `ScheduleWakeup` with `stop=true`.

## 7. Missing servers

dod-guard alone is enough to run this skill. Each other server buys one named
behavior, and its absence narrows the run without stopping it.

| Server absent | What you lose, and what to do |
|---|---|
| gitevo | No branches and no checkpoints. Work on the current branch and commit after each sub-problem. |
| obsidian-rag | No recall and no persistence. Skip setup steps 1 and finish step 2. |
| code-review-graph | No impact analysis. Read callers and tests by hand in setup step 3. |
| evomcp | No fanout. Implement each sub-problem directly. |

When evomcp is present and a sub-problem has a clean scoped check, delegate it.
Call `solve` with one `spec` object: `{goal, verify_cmd, cwd}`, where
`verify_cmd` is the CLI form
`dod-guard check --dod-id=<id> --node-path=<path> --quiet`. Add `strategy` as
`"auto"`, `"best-of-n"`, or `"evolve"`, plus `budget_tokens` and `fanout` when
you want to bound the run. Use `evolve` with `{goal, fitness_cmd, cwd,
target_files}` only for a numeric score you want to push. Both are one object,
never loose arguments.
