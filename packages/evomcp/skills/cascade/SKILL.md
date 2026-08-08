---
name: cascade
description: >
  Cheap-model fanout with verified selection, escalating stuck sub-problems up a
  ladder that ends at the user. Use this skill whenever the user wants to dispatch
  implementation work to evomcp, says "cascade this", "solve this with evomcp",
  "fan this out", or hands over any feature/bugfix/optimization task with (or that
  could have) a machine-checkable acceptance test, especially tasks that would
  otherwise burn >50K host-model tokens. Also use it when reviewing or triaging an
  evomcp escalation report.
---
# Cascade: verified fanout with a four-rung ladder

Send implementation work to cheap parallel workers behind a verify command a
machine can run, then route every sub-problem the search cannot crack up a
four-rung ladder that ends at the user.

## Scope

This skill covers one implementation task at a time: writing the spec, testing
the verify command, dispatching workers through evomcp, reviewing the winning
patch, and deciding who owns each thing that goes wrong.

Out of scope, and worth saying out loud to the user when one of these is what
you were handed:

- Trivial single-function edits. The dispatch overhead costs more than it buys,
  so make the edit yourself.
- Tasks with no possible verification command. `solve` requires a `verify_cmd`,
  so use a different approach entirely.
- Architecture and design decisions. No command can decide them, so take them
  to the user.
- Tasks needing deep domain knowledge a cheap worker will not have. Do that
  work in this session instead.
- First-time setup of a project with no existing test, lint or build harness.
  Build the harness first, then come back.

## Start by reading session state

`.cascade-session/` holds the state that survives context compaction. Inspect it
before anything else.

| File | Holds |
|------|-------|
| `spec.json` | The last spec and its verify command |
| `result.json` | Summary of the last solve result |
| `escalation.json` | Escalation history for this task |
| `decisions.json` | Every user question asked and the answer given |
| `pending-decision.json` | One decision point still unanswered |

A `pending-decision.json` means the task is resumable: ask that question first
and carry its answer forward. A `spec.json` with no pending decision means this
is a re-invocation after an escalation, so load the prior spec and
`decisions.json` before you plan anything new.

Record every resolved decision in `decisions.json` and never re-ask it inside
the same task; read the recorded answer instead.

## Four checks before you dispatch anything

1. Run `evomcp status`. Confirm the backend is running with credentials set.
2. Confirm the verify command discriminates. It must fail on a deliberately
   broken change and give usable output on the current state.
3. Confirm the task is decomposed to one concern per `solve` call.
4. Run the ambiguity check on the spec. A trip is an authority gap: resolve it
   with the user at `U1` before you spend any fanout budget.

Then take a gitevo checkpoint with `evo_checkpoint`, labelled
`pre-solve-<task>`. Do this on every dispatch, always. The checkpoint after a
successful run is labelled `post-solve-<task>`, so the pair reads as a span.

## The verify command is the oracle

A verify command runs in a shell. A dod-guard check therefore goes through the
CLI rather than the MCP tool name: write
`dod-guard check --dod-id=<id> --node-path=<path> --quiet`, because `dod_check`
does nothing in a shell. Find node paths with `dod-guard tree --dod-id=<id>`.

dod-guard exit codes: `0` pass, `1` a proof failed or the document is tampered
or stuck, `2` a full run with drafts remaining, `3` usage error or DoD not
found. A scoped run with `--node-path` exits `0` when that subtree passes, which
is what makes a subtree usable as a verify command.

Prefer a DoD subtree over anything else, because it gives you a multi-layer
oracle with per-gate diagnostics. Do not use a full DoD as the verify command;
it is too slow for a repair loop, so scope it to a subtree.

Four rules for the command itself:

- Test it against a deliberately broken change and against the current state
  before dispatch.
- Narrow it to the relevant tests. A whole-suite run buries the signal, so name
  the tests that matter.
- Prefer an exit-code predicate. A framework that exits `0` on failure passes
  every candidate silently, so wrap it in something that exits non-zero.
- Fix a flaky verify command before any retry. Under a flaky verify the repair
  loop cannot tell a worker-caused break from a pre-existing one, so make it
  deterministic first.

Set `allowed_files` for targeted changes. Feed it from `get_impact_radius` in
code-review-graph when the blast radius is not obvious.

Put `held_out_tests` in the spec for anything a worker could cheat. Workers
never see them. Instead they run at the merge gate. A held-out failure means the
candidate cheated the visible oracle. Reject the candidate, harden the verify
command, and re-run. Handle that yourself rather than asking the user.

## Choosing the tool and sizing the spec

`solve` handles binary pass-or-fail fitness. `evolve` handles scalar fitness, a
number to improve. `orchestrate` walks `SPEC`, `TEST_AUTHOR`, `IMPLEMENT`,
`HARDEN`, `REVIEW`, `MERGE` in order, with human gates at `SPEC`, `TEST_AUTHOR`
and `REVIEW`. When the task wants that whole sequence, call `orchestrate` rather
than hand-rolling it from repeated `solve` calls. The ladder and the decision
points below apply to `orchestrate` runs too.

Each `solve` call targets exactly one concern. Independent parts get separate
calls.

Both tools take their arguments nested under a `spec` key, so a call looks like
`evomcp solve '{"spec": {"goal": "...", "verify_cmd": "...", "cwd": "..."}}'`.

Spec fields for `solve`: `goal`, `verify_cmd`, optional `build_cmd`, `test_cmd`,
`lint_cmd`, `budget_tokens`, `fanout`, `allowed_files`, `context`,
`held_out_tests`. `evolve` takes `fitness_cmd`, `target_files`, `generations`
and `population_size`. Pass a `cwd` with either.

Fanout defaults to 5. Use about 3 for a simple fix, 7 to 10 for complex
multi-file work, and 12 to 16 for open-ended problems. Past 16, decompose the
task instead of widening it.

Worker budget defaults to about 100K tokens. Use 200K to 300K for complex
multi-file work and 500K for very large changes. Under-budgeting workers is the
error to avoid, so round up when unsure.

Add `lint_cmd`, `build_cmd` and `test_cmd` only when the verify command is
expensive. They run before the verify step, cheapest first, and short-circuit on
failure. Never make one a duplicate of the verify command; leave the field unset
instead.

Write specs that hold up under any worker model. Get that from a tight verify
command, a small scope and explicit `context`, not from wording aimed at one
model's habits.

## Reviewing the winner

Review before you apply. Nothing goes on disk until it has cleared this order.

Read the full diff first. Look for these degenerate patterns: hardcoded outputs,
deleted assertions, broadened exception handling, unjustified type-ignore
markers, disabled lint rules, commented-out code, empty tests, and placeholder
markers left in place of work. A suspected pattern, or a file outside
`allowed_files`, is `U2`.

Re-run the verify command yourself against the candidate rather than trusting
the report that came with it.

Only then apply every hunk of the winner, using whatever the tool hands back. The returned
artifact is not a fixed filename or a fixed apply command, so read what came
back and act on that. With the patch applied, run every held-out test.

## Classify every escalation before you diagnose it

Every escalation is either a capability gap or an authority gap. Decide which
before you touch a single technical detail.

A capability gap is work that is hard. It climbs the rungs in order and never
reaches the user before the host model has attempted it.

An authority gap is a decision that is not yours. It goes straight to Rung 3
from whatever rung it surfaced on. Ambiguous intent, conflicting requirements,
scope tradeoffs, choosing which behavior is correct, acceptable-cost judgments,
and deleting user-written code are all authority gaps. Architecture and design
questions are authority questions too: send them to the user rather than to fanout.

Misrouting an authority gap as a capability gap is the most common failure of
this workflow. When you cannot tell which one you have, treat it as authority
and ask.

## The four rungs

A stuck sub-problem climbs exactly four rungs, no more.

- Rung 0: the worker repair loop inside evomcp.
- Rung 1: worker resample inside evomcp.
- Rung 2: the host model in this session, solving only the stuck node and not
  the whole task.
- Rung 3: the user, asked through `AskUserQuestion`.

There is no fifth rung. When Rung 3 is reached and answered, act on the answer.

## Reading an escalation report

The report carries the common failure signature, the best partial attempt,
per-lineage diagnostics, and the lineages and tokens consumed. Read it this way:

- All lineages stuck on the same assertion means the verify command is
  trustworthy and the gap is a capability gap on that one assertion. At Rung 2,
  fix that assertion only, then re-invoke with the partial as context.
- Diverse failure signatures mean the verify command is too broad or the task
  too large. Decompose it, with a narrower verify command per sub-task.
- A decomposition that changes scope or interfaces stops being a technical call
  and becomes an authority question. Take it to `U1`.
- When the best partial is close to correct, fix only the blocking piece and
  leave the working part untouched.

Diagnose before you re-invoke. The same spec retried gives the same result, so
change the verify command, the decomposition or the context first. At most two
re-invocations follow an escalation.

Bad verify commands are the first thing to rule out, because a wrong oracle is
the failure that wastes the most of this workflow's budget. A verify command can
be bad three ways: flaky, too noisy to read, or checking the wrong behavior
while passing reliably.

## The six decision points

Ask the user at exactly these six triggers, named `U1` through `U6`.

- `U1`: the goal admits two or more materially different verify commands, the
  acceptance behavior is underdetermined, the task hides an unstated tradeoff
  such as speed against readability or strictness against compatibility, or the
  word "fix" has more than one candidate meaning here. This fires before any
  fanout budget is spent, and the answers go into the spec's `context` field so
  the workers see them.
- `U2`: the winning patch shows a suspected degenerate pattern, or it touches
  files outside `allowed_files`. Ask rather than applying or discarding such a
  patch on your own.
- `U3`: the escalation diagnosis is ambiguous between a bad verify command and a
  genuinely hard problem.
- `U4`: host-model spend on one stuck node approaches 50K tokens.
- `U5`: the third escalation on the same task. This is a mandatory hard stop, so
  stop and ask rather than starting another attempt.
- `U6`: any action that deletes user-written code, changes a public interface, or
  alters behavior beyond the stated goal. Attach `get_impact_radius` output to
  the evidence.

Every user question carries two to four concrete options, a marked
recommendation with a one-sentence reason, and an evidence pack. Keep the
best-partial summary inside that pack to at most ten lines.

Never ask the user a question a command can answer; run the command instead.
Never ask the user to pick among candidates. Let the verifier select instead, and show
the user at most one winner plus a flag.

With no interactive question tool available, write the question, the options and
the evidence to `.cascade-session/pending-decision.json`, surface it in the final
report, and leave the task resumable. Never substitute your own answer for the
user's. Instead stop and hand the question over.

When users answer the same decision point over and over, that is a bug in your
spec template. Encode the standing answer into the playbook instead of asking
again.

## Agents and the dispatch ceiling

Three agents ship with this skill. Dispatch each by bare name; the plugin
namespace is added when the plugin installs.

| Agent | Tier | Does |
|-------|------|------|
| `spec-writer` | `host` | Writes the spec and runs the ambiguity check |
| `patch-reviewer` | `host-light` | Checks solve output for correctness, degenerate patterns and scope creep |
| `escalation-handler` | `host` | Classifies authority against capability, diagnoses the verify command, solves the stuck node |

Tiers are roles. Which model sits behind a tier is deployment configuration, and
this file does not name it. `host` is the model running this skill.
`host-light` is the cheapest tier that can still pattern-match a diff.

Hold to this ceiling: at most one `spec-writer` per task, one `patch-reviewer`
per winning patch, and one `escalation-handler` per escalation. A task that
escalates twice therefore spends at most four agent dispatches.

## The worker backend stays unnamed

Never name, tune for, or debug the worker backend from this skill; say worker
and lineage and describe behavior instead. Swapping the backend requires zero
changes to this file, and keeping model names out of it is what preserves that.

A backend that produces no output is not a spec problem. Report it through
`evomcp status` and stop the run rather than retrying blind.

## Finishing the task

After you apply the patch, clear all four of these before you call the task
done:

1. The full test suite passes, not only the targeted tests.
2. A full dod-guard check passes, when a DoD subtree was the verify command.
3. A gitevo checkpoint is taken.
4. The commit message carries the verification evidence and any decision
   identifiers from `decisions.json` that shaped the spec.

Log outcomes to the gitevo memory bus with `evo_learn`, one record per outcome:

- `ELITE_SOLUTION:` names the task, the winning strategy, and the tokens spent.
- `FAILURE_SIGNATURE:` names the task, the signature, and how many lineages tried.
- `USER_DECISION:` names the task, the question asked, and the answer given.

Later sessions read these back, so a record missing its fields is a record that
cannot be used.
