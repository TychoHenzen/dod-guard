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

# Skill Debug

Read what the skill actually did. Compare it against what the skill said. Fix
the text that failed, and nothing else.

## Why this exists

A skill is a prompt, so it fails the way prompts fail. The agent reports every
phase as done. The output looks like the output of a run that worked. Nothing
raises an error, because nothing checked.

Asking the model afterwards does not help. It no longer holds the run, and it
will produce a fluent account of why it did the right thing. That account is
generated, not remembered.

The transcript is the only record of what happened. It holds every tool call in
order, every failure, and every word the user typed mid-run. This skill reads
that and nothing else.

## What counts as evidence

Ranked. The top of this list settles arguments with the bottom of it.

1. **A user turn during the run.** Somebody stopped the agent and said what was
   wrong. Nothing beats it.
2. **A tool error.** A command the skill names came back non-zero.
3. **A phase with no tool calls under it.** The skill required work that leaves
   a trace, and no trace is there.
4. **Steps in the wrong order,** or a phase that never appears.
5. **What the agent said it did.** Worth reading, never worth trusting. A `say`
   line is a claim. The tool lines above and below it are the fact.

## Phase 1: Find the runs

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-debug/scripts/find-runs.mjs" \
  --skill=<name> --days=30
```

Names work bare or qualified. `tighten` and `dod-guard:tighten` find the same
runs. Exit 4 means no run in that window, so widen `--days` before concluding
anything.

Read the counts. A run with user turns is the one to open first. So is a run
that is far shorter than its neighbours, because a short run of a long skill
stopped early.

## Phase 2: Read the skill as a contract

Read the SKILL.md under debate. Read every script it calls and every agent it
dispatches. Write down the sequence it requires, one line per phase, with the
observable each phase should leave behind.

Do this before you look at a trace. An expected sequence written afterwards
bends toward what the trace already shows, and then every run passes.

## Phase 3: Extract the traces

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-debug/scripts/extract-run.mjs" \
  --session=<id> --skill=<name> --run=1
```

The session id takes a unique prefix. Add `--sidechains` when the suspect is an
agent brief rather than the orchestrator. Subagent steps are marked `~`.

Pull at least two runs when two exist. One run cannot tell a skill defect from a
bad day.

## Phase 4: Align

Walk the expected sequence against the trace. Every phase gets one verdict:
ran, ran wrong, ran out of order, or never ran. Record the step numbers that
carry each verdict.

Then walk the other way. Every stretch of trace that answers to no phase is
work the skill never asked for. That is a finding too, and usually it means the
agent hit a gap and improvised.

## Phase 5: Name the cause

A divergence and its cause are different things, and the fix follows the cause.

| Cause | What the trace shows | Fix shape |
|---|---|---|
| missing step | the agent improvised work the skill never named | add the step |
| ambiguous wording | the agent did something the text allows and you did not want | narrow the wording |
| ignored instruction | the text is plain and the agent did otherwise | move it into the rules block, or have a script enforce it |
| escape hatch | the skill offered an exit and the agent took it | delete the exit |
| broken script | a command the skill names failed or printed nothing | fix the script |
| wrong altitude | the skill said how, and the agent needed what | rewrite the phase |
| lost late | the run held the shape early and dropped it after step 80 | move the instruction later in the file, or shorten the run |

The last two rows are the ones models get wrong. Both look like the agent being
careless. Neither answers to stronger wording.

## Phase 6: Rank

Sort by cost, then by how often it happened.

Cost is what the divergence did to the run. A finding that ended a run early
outranks one that produced a slightly worse result. A finding in every run
outranks one seen once. Say plainly which findings rest on a single run.

## Phase 7: Report

One block per finding.

```
### {what went wrong, in one line}
seen in: {n of m runs}   cause: {row from the table}
evidence: run {k} steps {a}-{b}, session {id}
  {the step lines, quoted}
skill text at fault: {heading or line}
fix: {the edit}
```

Stop here and show the user. The findings are what they asked for. Applying an
edit to a skill that ships is a separate decision, so let them make it.

## Phase 8: Apply

Apply the edits the user accepts. One edit per finding, in the SKILL.md or the
agent brief that carries the fault.

Then say what the next run should show if the fix worked. That sentence is what
somebody checks after the next run, and writing it is how you find out whether
a fix is testable at all.

## Debugging this skill

It reads its own transcripts like any other. `--skill=skill-debug` works.

## Rules

1. **Cite a step.** No edit without a step number from a real run.
2. **Two runs make a pattern.** One run is an anecdote. Label it as one.
3. **Never take the agent's word.** A `say` line records a claim. Check the
   tool lines under it.
4. **A user correction outranks your reading.** They were there.
5. **Fix the text that failed.** Not the file around it.
6. **Prefer a script to a sentence.** An instruction a script can check gets
   followed. One that rests on the agent remembering gets dropped at step 90.
7. **Never add an escape hatch while removing one.** "Skip when it seems
   unnecessary" is the defect, in every skill, every time.
8. **One edit per finding.** A bundled rewrite cannot be traced back to the run
   that justified it.
