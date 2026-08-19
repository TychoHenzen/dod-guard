---
name: skill-debug
description: >-
  Debug a skill from the sessions that ran it. Finds every recent run in the
  session transcripts, compacts each into a numbered trace of what the agent
  actually did, aligns that against what the SKILL.md told it to do, and reports
  each divergence with its cause and a fix. Every proposed edit cites a step
  number from a real run, so the skill is never rewritten from taste. TRIGGER
  when: user says "debug this skill", "why did /x do that", "the skill ignored
  its own steps", "fix the skill", or reports that a skill misbehaved earlier.
  DO NOT TRIGGER for writing a new skill, which is /skill-creator, or for a bug
  in code that a skill happened to touch.
argument-hint: "[skill name, and optionally a session id]"
---

# Skill debug

Goal: account for the behavior of a target skill on its real runs, and produce
edits that would have changed those runs.

You have shell and file tools. This skill dispatches no subagents.

Scope: one target skill per invocation, and every finding covers that skill alone.

## Runtime path

Resolve `<skill-dir>` before running a bundled script. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/skills/skill-debug`. In Codex, use the directory containing this loaded
`SKILL.md`. Confirm the resolved script exists. If neither path resolves, end the turn with the
missing path.

## Terms

**run** - one execution of the target skill in one session.
**trace** - the numbered listing of a run.
**step** - one numbered line of a trace.
**phase** - one unit of the sequence the target SKILL.md requires.
**finding** - one gap between a trace and that sequence.
**cause** - the property of the skill text that opened the gap.

Session transcripts decide every question of fact here. Never ask a model to
recount a past run. Pull that run's trace and read it instead.

## The two scripts

Locate runs:

```bash
node "<skill-dir>/scripts/find-runs.mjs" \
  --skill=<name> --days=30
```

Flags: `--skill`, `--days` (default 30), `--limit`, `--projects`. Exit 0 printed
a list of runs. Exit 4 found nothing inside the window, so raise `--days` and run
it again before you conclude anything. Exit 3 is a usage error.

`--skill` takes the bare name or the plugin-qualified one. `tighten` and
`dod-guard:tighten` reach the same runs.

Turn one run into a trace:

```bash
node "<skill-dir>/scripts/extract-run.mjs" \
  --session=<id> --skill=<name> --run=1
```

Flags: `--session`, `--skill`, `--run` (default 1), `--max-steps`,
`--sidechains`, `--projects`. Exit 0 printed a trace. Exit 4 matched no such
session or run number. Exit 3 is a usage error.

`--session` takes the whole id, any unique prefix of it, or a path. Add
`--sidechains` to fold subagent steps into the trace, where a leading `~` marks
each one. Reach for it once an agent brief looks more at fault than the
orchestrator.

## Before the first trace

Read the target SKILL.md end to end, along with every script it calls and every
agent it dispatches. Out of that reading, write the sequence it demands: the
phases in order, each carrying the trace evidence it ought to produce. That
written sequence is the standard you score against. Finish it while no trace has
been read.

## Gather runs

Take two runs or more whenever two exist, and mark in the report any finding that
only one run supports. A run far shorter than its peers stopped early.

## Score the sequence against the trace

Note the step numbers that back every verdict you assign. Each phase in the
sequence takes one verdict out of four: ran, ran wrong, ran out of order,
never ran.

Then read the trace on its own terms, front to back. Any run of steps that no
phase accounts for is a finding.

## Which evidence wins

When two pieces of evidence disagree, the higher one on this list decides it.

1. a user turn inside the run that halted or redirected the agent
2. a tool call that came back with an error or a non-zero exit
3. a tool call whose arguments run against what the skill laid out
4. a phase the sequence demands, with no tool line beneath it
5. a phase out of sequence, or missing from the trace
6. the agent's account of its own work. A `say` line is a claim. The tool lines
   around it are the fact.

## Diagnose

The gap is not the cause, and the edit answers the cause.

| Cause | What the trace shows | Fix shape |
|---|---|---|
| missing step | work appears with no counterpart in the skill text | write the step in |
| ambiguous wording | the run stayed inside what the text allows and still landed wrong | tighten the wording until only the wanted reading survives |
| ignored instruction | the text states it plainly and the run went the other way | promote it into the rules block, or let a script enforce it |
| escape hatch | the skill made a step optional and the run declined it | drop the option |
| broken script | a command the skill names errored or printed nothing | repair the script |
| wrong altitude | the skill spelled out how, and the run needed what | rewrite that phase |
| lost late | early steps hold the sequence, and drift sets in past roughly step 80 | push the instruction further down the file, or cut the run shorter |

## Write the report

Sort by cost, breaking ties by count. Cost measures damage to the run. A finding
that cut a run short sorts above one that only weakened the output. A finding
that shows up in all runs sorts above one that shows up once.

One block per finding:

```
### {what went wrong, in one line}
seen in: {n of m runs}   cause: {row from the table}
evidence: run {k} steps {a}-{b}, session {id}
  {the step lines, quoted}
skill text at fault: {heading or line}
fix: {the edit}
```

Each edit you propose points at a step number in a run you actually pulled. That
holds for every edit, with nothing exempt.

Hand the report to the user and wait. Changing a shipped skill is the user's
call.

## Edit what the user accepts

Work through the accepted findings one at a time, one edit each. Each edit lands
in whichever file holds the fault, the SKILL.md or the agent brief. It touches
the failing text alone and leaves its neighbors as they were. Fold unrelated
rewriting in and the change no longer traces back to the run behind it.

Where a script can check the fix, choose that over a fix the agent must remember.
A long run sheds a remembered instruction somewhere past step 90.

Never trade one optional exit for another. Spell out the condition the skill can
test instead.

Once every accepted edit is in, say what the next run should show if the fix
holds.
