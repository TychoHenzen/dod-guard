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
---

# Skill debug

Find out what a skill really did on past runs, and write the edits that would have changed those runs. One target skill per invocation. Each finding concerns that skill alone. No subagents: use shell and file tools only. No GitHub writes.

Read `standards/working-defaults.md` from the plugin root. Stricter boundaries in this skill win.

## Words used here

- run: one execution of the target skill in a session
- trace: the numbered record of one run
- step: one numbered line in a trace
- phase: one stage the target SKILL.md orders
- finding: one gap between a phase and the trace, with evidence
- cause: why the gap happened (the gap itself is not the cause)

## Tools

Set `<skill-dir>` first. In Claude it is `${CLAUDE_PLUGIN_ROOT}/skills/skill-debug`. In Codex it is the directory holding the loaded SKILL.md. Check that `<skill-dir>/scripts/find-runs.mjs` exists. If the path does not resolve, end the turn and name the missing path.

Facts come from session transcripts only, through these scripts. Never ask a model to recount a past run.

```bash
node "<skill-dir>/scripts/find-runs.mjs" --skill=<name> --days=30
node "<skill-dir>/scripts/extract-run.mjs" --session=<id> --skill=<name> --run=1
```

| Script | Flags |
|---|---|
| find-runs.mjs | `--skill`, `--days` (default 30), `--limit`, `--projects` |
| extract-run.mjs | `--session`, `--skill`, `--run` (default 1), `--max-steps`, `--sidechains`, `--projects` |

- `--skill` takes a bare or plugin-qualified name: `next-ticket` and `dod-guard:next-ticket` reach the same runs.
- `--session` takes a full id, a unique prefix, or a path.
- `--sidechains` adds subagent steps to the trace, each marked with a leading `~`.
- Exit codes, both scripts: 0 success, 3 usage error (no skill given), 4 nothing found (skill never ran in the window, session absent, or run number past the end).

## Procedure

1. Write the standard. Read the target SKILL.md end to end, plus every script it calls and every agent it dispatches. Write the expected phase sequence, and under each phase the trace evidence it should leave. Finish this before you read any trace. It is the scoring standard.
2. Find runs. On exit 4, raise `--days` and rerun before you conclude anything.
3. Extract runs. When two or more exist, use at least two. A run much shorter than its peers stopped early: flag it. Mark any finding that only one run supports.
4. Score each phase in each run as `ran`, `ran wrong`, `ran out of order`, or `never ran`. Cite step numbers behind every verdict.
5. Read each trace front to back on its own. A stretch of steps that no phase accounts for is a finding.
6. Diagnose each finding (table below), then report.

When evidence conflicts, the item higher in this list decides:

1. A user turn in the run that halted or redirected the agent.
2. A tool call with an error or non-zero exit.
3. A tool call whose arguments contradict the skill.
4. A demanded phase with no tool line beneath it.
5. A phase out of sequence or missing from the trace.
6. The agent's own account. A `say` line is a claim; tool lines are fact.

## Causes

Name the cause, then fix that cause with the matching shape.

| Cause | What the trace shows | Fix shape |
|---|---|---|
| `missing step` | The agent improvised where the skill was silent. | Write the step in. |
| `ambiguous wording` | The agent took a reading the author did not intend. | Tighten until only the intended reading survives. |
| `ignored instruction` | Clear text, skipped anyway. | Promote it into a rules block, or have a script enforce it. |
| `escape hatch` | The agent used an optional exit. | Remove the option. |
| `broken script` | A script call failed or gave wrong output. | Repair it. |
| `wrong altitude` | The phase said how when the run needed what. | Rewrite that phase. |
| `lost late` | Obeyed early, dropped after roughly step 80. | Move it later in the file, or shorten the run. |

Rules for fixes:

- A script that can enforce the fix beats an instruction the agent must remember. Long runs shed remembered instructions past roughly step 90.
- Never swap one optional exit for another. State a testable condition.
- If an agent brief looks more at fault than the orchestrator, re-extract with `--sidechains`.

## Report

Order findings by cost, then by number of runs. A finding that cut a run short outranks one that only degraded output. One seen in all runs outranks one seen once. Every proposed edit cites a step number from a run you pulled. No edit from taste.

```
### {what went wrong, in one line}
seen in: {runs; "one run only" if so}
cause: {row name}
evidence: run {k} steps {a}-{b}, session {id}
  {quoted step lines}
skill text at fault: {quoted text, or "absent"}
fix: {the edit, in the fix shape for the cause}
```

Give the report to the user and wait. Changing a shipped skill is their call. Do not edit before they accept.

## After acceptance

Apply accepted findings one at a time, one edit each, in the file that holds the fault (SKILL.md or an agent brief). Touch only the failing text. Leave neighbors alone and fold in no unrelated rewriting. Leave rejected findings unchanged.

When done, say what the next run should show if the fix holds.
