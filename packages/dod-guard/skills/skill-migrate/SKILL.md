---
name: skill-migrate
description: >-
  Migrate a skill to work on post-4.6 Claude models by blind-rewriting it from
  a behavioral contract. Extracts what the skill accomplishes, classifies which
  instructions are scaffolding written for 4.6, deletes the SKILL.md, and has a
  blind writer rebuild it for the target model. Gates on overlap (not a
  paraphrase), benchmarks on both the target model and 4.6, and reports the diff
  without applying it. One skill per invocation. TRIGGER when: user says
  "migrate this skill", "tune for Opus 5", "make this work on newer models",
  "fix skill for literal models", "benchmark this skill across models". DO NOT
  TRIGGER for writing a new skill (that is /skill-creator) or debugging a skill
  from transcripts (that is /skill-debug).
argument-hint: "<skill name or path to SKILL.md>"
---

# Skill Migrate

Take a skill that works on Opus 4.6. Rebuild it from what it accomplishes, not
from what it says. Prove the result works on both the target model and on 4.6.

## Why this exists

Post-4.6 Claude models follow instructions more literally and infer less
unstated intent. Skills written for 4.6 break because they rely on the model
filling inference gaps. The fix is subtraction: delete scaffolding the model
does natively, make intent explicit, and let the model use judgment.

Patching a skill line by line cannot get there. The old structure is an
attractor. A model told to "make this work better on Opus 5" renames a
variable, adds an explicit instruction, and reports a migration. The result
is longer, not simpler, and the skill still relies on inference in every place
the patch did not reach.

This skill uses `/blind-rewrite`'s prose track instead. It extracts what the
skill must accomplish, deletes the SKILL.md, and has a fresh agent rebuild it
without seeing the original. The rebuild targets post-4.6 models by
construction, because the writer receives the contract and the model
guidance, not the old prose.

## The post-4.6 model

These findings come from Anthropic's official guidance and measured practice.
They go into the blind writer's briefing as positive targets.

1. **Shorter, not longer.** Anthropic removed over 80% of Claude Code's system
   prompt for Opus 5 with no loss on coding evals. A migrated skill should be
   shorter than the original.
2. **What, not how.** State the goal and the verification. Let the model pick
   the method. Worked examples that show one approach constrain exploration.
3. **No verification scaffolding.** Post-4.6 models verify their own work.
   "Double-check your work", "re-read Phase N and confirm", "verify you did
   not miss anything" waste tokens and cause performative checking.
4. **Explicit scope, not inferred scope.** Where the skill relies on the model
   inferring scope from context, state the scope. "Apply this to every section,
   not just the first one."
5. **Judgment over rules.** A principle the model can apply to novel cases beats
   a rule list the model follows literally and cannot generalize.
6. **Script-enforced gates over prose rules.** An instruction a script checks
   survives at step 200. One that rests on the model remembering gets dropped.

## Phase 0: Read the skill

Read the target SKILL.md, every agent it dispatches (find `subagent_type`
references), and every script it calls (find `${CLAUDE_PLUGIN_ROOT}` paths
or `node` commands in fenced blocks).

Build an inventory:
- The skill's goal in one sentence
- Each phase and what it accomplishes
- Each agent dispatch and what it returns
- Each script call and its exit code meaning
- The rules section

The inventory goes to the contract extractor and to the blind writer.

## Phase 1: Contract

Dispatch `dod-guard:blind-prose-contract-extractor` against the SKILL.md.

The extractor returns:
- REQUIRED claims (what the rest of the system depends on)
- OBSERVED claims (only this skill asserts them)
- Verbatim text (names, formats, schemas that must match exactly)
- A dependency census (what cites this skill)
- Banned vocabulary

## Phase 2: Intent classification

Dispatch `dod-guard:migration-analyst` with the contract and the inventory.

The analyst classifies each OBSERVED item:

| Tag | Meaning | Fate |
|---|---|---|
| ESSENTIAL | The skill needs this to work | Kept |
| SCAFFOLDING | Compensates for 4.6's inference gaps | Candidate for removal |
| ACCIDENTAL | A quirk of the current wording | Dropped |

A SCAFFOLDING item is an instruction that newer models follow from context or
do natively. Verification reminders, constraining examples, over-specified
procedures, and redundant "never do X" rules the model infers from the goal.

The analyst also identifies scripts and agents that enforce behavior the
rewritten skill must preserve. Those go into the writer's briefing as
hard constraints.

## Phase 3: Human gate

Show the user the REQUIRED claims, the OBSERVED claims with their tags, and
which items the analyst marked SCAFFOLDING. Ask the user to confirm:

1. Which SCAFFOLDING items to drop (they may want to keep some for safety)
2. Which OBSERVED items are requirements the extractor missed
3. Whether any REQUIRED claim is wrong

This is the only mandatory human step.

## Phase 4: Generate eval cases

For each REQUIRED claim and each kept OBSERVED claim (up to 8, sorted by
importance), write one eval case. Each case tests whether a model running
the skill does the right thing for that claim.

### The sandbox

Each eval runs in a disposable git repo. The sandbox contains:
- Files the scenario needs (3-8 files, under 500 lines total)
- A seed git commit so git commands work
- A task that exercises the claim being tested

### Eval case format

```json
{
  "id": "claim-short-name",
  "prompt": "The user prompt triggering the scenario",
  "claim": "The REQUIRED or OBSERVED claim being tested",
  "fixtures": {
    "files": {
      "path/to/file.md": "inline:file content here",
      "path/to/script.mjs": "copy:/absolute/path/to/real/script"
    }
  },
  "assertions": {
    "tool_calls": [
      {"type": "tool_called", "tool": "Agent", "args_contain": "step-implementer"},
      {"type": "tool_not_called", "tool": "Edit"}
    ],
    "repo_state": [
      {"type": "file_modified", "path": "path/to/file.ts"},
      {"type": "file_contains", "path": ".step-session/steps.json", "value": "completed"}
    ]
  }
}
```

Assertion types for tool calls: `tool_called`, `tool_not_called`,
`tool_order`, `tool_count`. Assertion types for repo state: `file_modified`,
`file_not_modified`, `file_created`, `file_contains`, `file_not_contains`.

Save each case to `.skill-migrate/cases/<id>.json`.

Show the cases to the user and wait for approval.

## Phase 5: Benchmark before

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

After all cases, aggregate into `.skill-migrate/runs/before/benchmark.json`.

Clean up sandboxes after grading.

## Phase 6: Quarantine and blind rewrite

### Quarantine

```bash
mkdir -p .skill-migrate/quarantine
cp <path-to-target-SKILL.md> .skill-migrate/quarantine/original-SKILL.md
```

Add `.skill-migrate/quarantine/` to the banned list.

### Delete and rewrite

Remove the SKILL.md content below the frontmatter. Keep the frontmatter
(name, description, argument-hint) since those are the skill's identity.

Dispatch `dod-guard:blind-prose-writer` with:

```
Contract: {the pruned contract from Phase 3}

Inventory (hard constraints):
- Scripts: {each script path, its purpose, its exit codes}
- Agents: {each agent name, what it does, what it returns}
- Frontmatter: {the kept frontmatter}

Post-4.6 targets:
1. Shorter than the original. Aim for 50-70% of original line count.
2. State goals and verification, not procedures.
3. No verification scaffolding. No "double-check", no "re-read and confirm."
4. Explicit scope where the original relies on inference.
5. Principles over rule lists.
6. Script references where the original uses prose rules.

Audience: a Claude model running in Claude Code with tool access.
Register: direct, technical.
Length: aim for {50-70% of original line count} lines.

Banned paths (do not read):
- {quarantine path}
- {any other copies found in Phase 1 leak sweep}
```

One dispatch for the whole skill. The writer produces the complete body below
the frontmatter.

### Reassemble

Combine the kept frontmatter with the writer's output into the migrated
SKILL.md at `.skill-migrate/migrated-SKILL.md`.

## Phase 7: Verify claim coverage

Walk every REQUIRED claim and every kept OBSERVED claim. Find where the new
skill carries each one. A claim you cannot point at is a gap. Redispatch the
writer with that claim named.

## Phase 8: Overlap gate

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/blind-rewrite/scripts/overlap-scan.mjs" \
  --mode=prose \
  --original=.skill-migrate/quarantine/original-SKILL.md \
  --rewrite=.skill-migrate/migrated-SKILL.md \
  --contract-file=<path-to-verbatim-file>
```

Exit 0 means rewritten. Exit 1 means cosmetic. On exit 1, redispatch the
writer. Tell it the result was too close to the original. Give it nothing
else about how it was close.

## Phase 9: Gap audit

Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned
contract. Repair every gap it reports. A gap repair is a normal sighted edit.

An item the analyst tagged SCAFFOLDING or ACCIDENTAL that the user confirmed
dropping is not a gap.

## Phase 10: Benchmark after (target model)

Run the same eval cases against `.skill-migrate/migrated-SKILL.md` on the
target model. Use `"after_migration"` as the benchmark configuration.

Compare with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/compare-runs.mjs" \
  --before=.skill-migrate/runs/before/benchmark.json \
  --after=.skill-migrate/runs/after/benchmark.json
```

If pass rate dropped on any case, check whether the new skill dropped a
claim. If so, dispatch the writer to add it. If the skill carries the claim
and the model still fails, that is a finding for the report.

## Phase 11: 4.6 compatibility gate

Run the same eval cases against `.skill-migrate/migrated-SKILL.md` on
`claude-opus-4-6`. Use `"after_46"` as the configuration.

A simpler, more explicit skill should work better on 4.6, not worse. If a
case regresses, identify which claim the 4.6 model misread. Edit the migrated
skill to make that claim clearer without adding scaffolding back. Allow two
edit-and-rerun cycles.

If the regression persists, mark it in the report. Do not revert the whole
migration for one case.

## Phase 12: Report

```
Skill           <name>
Target model    <model>
Verdict         accepted | partial | rejected

                pass_rate    tokens    lines
Before          <val>        <val>     <original lines>
After (target)  <val>        <val>     <migrated lines>
After (4.6)     <val>        <val>     <migrated lines>

Scaffolding dropped   <n items>
Claims preserved      <n of m>
Overlap gate          <run score> / <ngram score>
```

Then a per-claim table: claim tested, pass/fail per model, tokens.

End with the diff between the original and migrated SKILL.md. Do not apply
it. The caller decides whether the migration lands.

## Rules

1. **One skill per invocation.** Mixing skills produces shallow analysis.
2. **Benchmark before rewriting.** The before-run is the baseline.
3. **Delete before dispatching the writer.** A writer that reads the original
   reproduces it.
4. **Assert on actions and repo state.** Never grade on output text.
5. **The 4.6 gate runs last.** A simpler skill should not regress on 4.6.
6. **The human prunes OBSERVED.** Never decide which scaffolding to drop
   without asking.
7. **Do not apply the migration.** Show the diff. The caller decides.
8. **Shorter is the target.** A migration that makes a skill longer has
   failed the premise.
