---
name: skill-migrate
description: >-
  Migrate a skill to work on post-4.6 Claude models without breaking 4.6
  compatibility. Analyzes a SKILL.md for inference gaps (places where literal
  models take the wrong action), generates eval cases with sandbox fixtures,
  benchmarks before and after migration, and gates on 4.6 compatibility.
  One skill per invocation. TRIGGER when: user says "migrate this skill",
  "tune for Opus 5", "make this work on newer models", "fix skill for
  literal models", "benchmark this skill across models". DO NOT TRIGGER for
  writing a new skill (that is /skill-creator) or debugging a skill from
  transcripts (that is /skill-debug).
argument-hint: "<skill name or path to SKILL.md>"
---

# Skill Migrate

Take a skill that works on Opus 4.6. Make it work on post-4.6 models too.
Prove the result with a benchmark. Do not break 4.6.

## Why this exists

Post-4.6 Claude models follow instructions more literally and infer less
unstated intent. This shift is intentional and progressive across 4.7, 4.8,
Sonnet 5, and Opus 5. Skills written for 4.6 break because they rely on
the model filling inference gaps. 4.6 filled those gaps from context.
Newer models do not.

The official guidance is subtraction: delete scaffolding the model does
natively, make intent explicit, let the model use judgment. But a migration
that breaks 4.6 is worse than no migration, because 4.6 is the known-good
model. So every change runs against both the target model and 4.6.

## The failure mode taxonomy

Six ways a literal-minded model misreads a skill:

| Mode | What happens |
|---|---|
| artifact-chase | Model checks output artifacts instead of fixing the source |
| surface-interpret | Model takes the shallowest reading of an instruction |
| step-skip | Model optimizes away a step the skill bans skipping |
| lost-late | Model drops a rule that appears past line 200 |
| worker-trust | Model trusts a subagent report without verifying |
| escape-hatch | Model takes a conditional exit the skill meant to be narrow |

## Phase 0: Read the skill

Read the target SKILL.md, every agent it dispatches (find `subagent_type`
references), and every script it calls (find `${CLAUDE_PLUGIN_ROOT}` paths
or `node` commands in fenced blocks).

Build a manifest:
- Phases (numbered headings or sections)
- Rules (the numbered list under a "Rules" heading)
- Agent dispatches (agent names and what they receive)
- Script calls (paths, arguments, exit code meanings)
- Escape hatches (conditional language offering an exit)
- Negative instructions ("never", "do not", "must not")
- Late instructions (anything past line 200)

## Phase 1: Analyze inference gaps

Dispatch `dod-guard:migration-analyst` with the full skill text and manifest.

```
Analyze this skill for inference gaps. The skill text, its agents, and its
scripts follow.

Skill: <full SKILL.md text>
Agents: <each agent text, labeled>
Scripts: <each script path and its first 30 lines>

Return the gap table and one eval scenario per gap.
```

The analyst returns a table of gaps classified by failure mode, severity,
and the transform that addresses each one. It also returns one eval scenario
sentence per gap.

## Phase 2: Generate eval cases and sandboxes

For each gap (up to 5, sorted by severity), write one eval case. Each case
needs a prompt, assertions, and fixture files for a sandbox.

### The sandbox

Each eval runs in a disposable git repo. The sandbox contains:
- Files the scenario needs (3-8 files, under 500 lines total)
- One planted defect matching the gap being tested
- A seed git commit so git commands work

### Fixture strategy by failure mode

**artifact-chase:** Plant a bug in a script or skill file. Also plant output
artifacts (scan results, logs) that show the symptom of the bug. The correct
action edits the script. The wrong action re-runs the scan or edits the output.

**surface-interpret:** Plant a user prompt with two readings. The skill text
in the sandbox disambiguates if read carefully. The correct action follows
the deeper reading. The wrong action follows the surface reading.

**step-skip:** Set up a state where a step looks unnecessary (e.g., the output
file already exists). The skill forbids skipping. The correct action runs the
step anyway. The wrong action skips it.

**worker-trust:** Plant a report file claiming success. The repo state shows
the work was not done. The correct action runs the check command. The wrong
action trusts the report.

**escape-hatch:** Set up a scenario matching an escape condition. The correct
reading of the condition says it does not apply here. The wrong action takes
the exit.

**lost-late:** Set up a long task. Put a critical constraint in the skill text
past line 200. Check whether the model follows it.

### Eval case format

```json
{
  "id": "artifact-chase-phase7",
  "prompt": "The user prompt triggering the scenario",
  "gap": "One sentence describing the gap",
  "failure_mode": "artifact-chase",
  "fixtures": {
    "files": {
      "path/to/file.md": "inline:file content here",
      "path/to/script.mjs": "copy:/absolute/path/to/real/script"
    }
  },
  "assertions": {
    "tool_calls": [
      {"type": "tool_called", "tool": "Edit", "args_contain": "file.md"},
      {"type": "tool_not_called", "tool": "Bash", "args_contain": "scan"}
    ],
    "repo_state": [
      {"type": "file_modified", "path": "path/to/file.md"},
      {"type": "file_not_modified", "path": "output.json"}
    ]
  }
}
```

Assertion types for tool calls: `tool_called`, `tool_not_called`,
`tool_order`, `tool_count`. Assertion types for repo state: `file_modified`,
`file_not_modified`, `file_created`, `file_contains`, `file_not_contains`.

Save each case to `.skill-migrate/cases/<id>.json`.

Show the cases to the user and wait for approval. This is the only
interruption in the workflow.

## Phase 3: Benchmark (before)

For each approved case, run these scripts in order:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/setup-sandbox.mjs" \
  --case=.skill-migrate/cases/<id>.json \
  --out=/tmp/skill-migrate-<id>

node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/run-eval.mjs" \
  --sandbox=/tmp/skill-migrate-<id> \
  --prompt="<the eval prompt>" \
  --skill=<path-to-target-SKILL.md> \
  --model=<target-model>

node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/extract-actions.mjs" \
  --transcript=/tmp/skill-migrate-<id>/transcript.jsonl \
  --out=/tmp/skill-migrate-<id>/actions.json

node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/grade-eval.mjs" \
  --sandbox=/tmp/skill-migrate-<id> \
  --actions=/tmp/skill-migrate-<id>/actions.json \
  --case=.skill-migrate/cases/<id>.json \
  --out=.skill-migrate/runs/before/<id>/grading.json
```

Copy `timing.json` from the sandbox to `.skill-migrate/runs/before/<id>/`.

After all cases, aggregate into `.skill-migrate/runs/before/benchmark.json`.
Use the skill-creator benchmark schema: `metadata`, `runs[]` with `eval_id`,
`configuration` (use `"before_migration"`), `result` with `pass_rate`,
`tokens`, `tool_calls`.

Clean up sandboxes after grading.

## Phase 4: Apply migration transforms

Apply each transform only if it addresses a gap from Phase 1. Work on a copy
of the SKILL.md at `.skill-migrate/migrated-SKILL.md`. Record which transforms
you applied and which gaps they address.

### Transform 1: Explicit action routing

Where the skill says "verify X" or "check Y" without naming the command, add
the command. "Run [script]. Exit 0 means [pass]. Exit 1 means [fail]."

### Transform 2: Delete verification scaffolding

Remove lines that say "double-check your work", "re-read Phase N and confirm",
"verify you did not miss anything". Post-4.6 models verify on their own. The
extra text costs tokens and causes performative rather than real checking.

### Transform 3: Script-enforce negative rules

For each "never do X" rule with no script backing it, write a gate script
that exits non-zero on violation. Or restructure the rule as a pre-condition
in the phase where it applies.

### Transform 4: Explicit scope boundaries

Where the skill relies on inference for scope, add a concrete boundary.
"Do not edit files the findings did not mention. Do not refactor adjacent
code. Do not expand the fix beyond the reported defect."

### Transform 5: Move late-run instructions earlier

Any instruction past line 200 that a gap tagged as lost-late: move it to the
phase where it first applies, or repeat it there. The original can stay if it
serves as a summary.

### Transform 6: Delete constraining examples

Remove output examples that show one specific approach when the skill wants
the model to choose its own. Keep examples that define a format or schema.

### Transform 7: State the why

Where the skill says "do X" with no rationale, add one sentence explaining
why. A model that understands the reason generalizes better than one that
pattern-matches on the instruction.

### Line budget

The migrated skill must not exceed the original line count plus 20%. Transforms
1, 3, 4, 5, and 7 add lines. Transforms 2 and 6 remove lines. If the budget
is tight, prioritize transforms that address high-severity gaps.

## Phase 5: Benchmark (after, target model)

Run the same eval cases against `.skill-migrate/migrated-SKILL.md` on the
target model. Use `"after_migration"` as the benchmark configuration.

Compare with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/compare-runs.mjs" \
  --before=.skill-migrate/runs/before/benchmark.json \
  --after=.skill-migrate/runs/after/benchmark.json
```

If pass rate did not improve on any case, review the transforms. Remove any
that did not affect the failing cases. Try a different transform for the same
gap. Allow one revision pass.

## Phase 6: 4.6 compatibility gate

Run the after-benchmark on `claude-opus-4-6`. Use `"after_46"` as the
configuration.

If any case regresses (passed before, fails after), identify which transform
caused it. Revert that transform from the migrated copy. Re-run only the
affected case on 4.6. Allow two revert-and-rerun cycles.

If the regression persists after reverts, mark the migration as rejected.
Report which gaps could not be addressed without breaking 4.6.

## Phase 7: Report

```
Skill           <name>
Target model    <model>
Verdict         accepted | partial | rejected
Gaps found      <n> (<failure modes>)
Transforms      <n> applied of <m> candidates

                pass_rate    tokens    tool_calls
Before          <val>        <val>     <val>
After (target)  <val>        <val>     <val>
After (4.6)     <val>        <val>     <val>

Reverted        <transforms that broke 4.6, if any>
```

Then a per-case table: gap tested, failure mode, pass/fail per model, tokens.

End with the diff between the original and migrated SKILL.md. Do not apply
it. The caller decides whether the migration lands.

## Rules

1. **One skill per invocation.** Mixing skills produces shallow analysis.
2. **Benchmark before editing.** The before-run is the baseline. Without it
   the delta means nothing.
3. **Every transform cites a gap.** A transform without a gap is taste.
4. **The 4.6 gate is the last gate.** Run it once, at the end.
5. **Assert on actions and repo state.** Never grade on output text. A model
   that does the wrong thing politely still fails.
6. **Stay within the line budget.** Original plus 20%.
7. **Sandboxes are disposable.** Clean up after grading.
8. **One interruption.** Show eval cases, get approval, then run to completion.
9. **Do not apply the migration.** Show the diff. The caller decides.
