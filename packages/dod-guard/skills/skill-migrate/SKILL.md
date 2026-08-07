---
name: skill-migrate
description: >-
  Migrate a skill to work on post-4.6 Claude models by blind-rewriting it from
  a behavioral contract. Extracts what the skill accomplishes, classifies which
  instructions are scaffolding written for 4.6, deletes the SKILL.md, and has a
  blind writer rebuild it for the target model. Benchmarks by running the old
  skill on both 4.6 and the target model, diffing the behavioral output, and
  judging which model handled each difference better. One skill per invocation.
  TRIGGER when: user says "migrate this skill", "tune for Opus 5", "make this
  work on newer models", "fix skill for literal models", "benchmark this skill
  across models". DO NOT TRIGGER for writing a new skill (that is
  /skill-creator) or debugging a skill from transcripts (that is /skill-debug).
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
attractor. This skill uses `/blind-rewrite`'s prose track instead. It extracts
what the skill must accomplish, deletes the SKILL.md, and has a fresh agent
rebuild it without seeing the original.

## The post-4.6 model

These findings come from Anthropic's official guidance and measured practice.
They go into the blind writer's briefing as positive targets.

1. **Shorter, not longer.** Anthropic removed over 80% of Claude Code's system
   prompt for Opus 5 with no loss on coding evals.
2. **What, not how.** State the goal and the verification. Let the model pick
   the method.
3. **No verification scaffolding.** Post-4.6 models verify their own work.
   "Double-check your work" wastes tokens and causes performative checking.
4. **Explicit scope, not inferred scope.** State the scope where the skill
   relies on inference.
5. **Judgment over rules.** A principle beats a rule list the model follows
   literally and cannot generalize.
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

The extractor returns REQUIRED claims, OBSERVED claims, verbatim text, a
dependency census, and banned vocabulary.

## Phase 2: Intent classification

Dispatch `dod-guard:migration-analyst` with the contract and the inventory.

The analyst classifies each OBSERVED item:

| Tag | Meaning | Fate |
|---|---|---|
| ESSENTIAL | The skill needs this to work | Kept |
| SCAFFOLDING | Compensates for 4.6's inference gaps | Candidate for removal |
| ACCIDENTAL | A quirk of the current wording | Dropped |

## Phase 3: Human gate

Show the user the REQUIRED claims, the OBSERVED claims with their tags, and
which items the analyst marked SCAFFOLDING. Ask the user to confirm:

1. Which SCAFFOLDING items to drop
2. Which OBSERVED items are requirements the extractor missed
3. Whether any REQUIRED claim is wrong

This is the only mandatory human step.

## Phase 4: Discovery runs

This phase replaces speculative claim-based assertions with measured
behavioral differences. Run the old skill on both 4.6 and the target model,
then diff the outputs. Discovery assertions are the primary benchmark.
Contract assertions are secondary.

### Design scenarios

Pick 2-3 representative scenarios that exercise the skill's core behavior.
Each scenario combines multiple claims. Each needs:
- A sandbox with 3-8 files, 200-500 lines total
- At least one file over 80 lines
- At least one ambiguous decision the model must make (shape classification,
  error handling strategy, retry path, scope boundary)
- A prompt a real user would give, not a synthetic test phrase
- A seed git commit so git commands work

A scenario that any model handles the same way has no discriminating power.
Test the scenario on one model first. If the run produces no judgment calls,
the scenario is too simple. Add complexity until the model has to choose.

Fixture checklist before running:
1. Does the sandbox have enough structure that classification is non-trivial?
2. Could a model reasonably disagree about the right approach?
3. Does the prompt match what a real user would type?
4. Are there enough call sites, tests, or cross-references that census or
   verification work matters?

Use the existing case format for sandbox setup:

```json
{
  "id": "scenario-name",
  "prompt": "The user prompt triggering the scenario",
  "fixtures": {
    "files": {
      "path/to/file.md": "inline:file content here",
      "path/to/script.mjs": "copy:/absolute/path/to/real/script"
    }
  }
}
```

Save scenarios to `.skill-migrate/scenarios/`.

### Run on both models

For each scenario, set up one sandbox and run twice (on separate copies):

```bash
# Setup
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/setup-sandbox.mjs" \
  --case=.skill-migrate/scenarios/<id>.json \
  --out=/tmp/skill-migrate-<id>-46

cp -r /tmp/skill-migrate-<id>-46 /tmp/skill-migrate-<id>-target

# Run on 4.6
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/run-eval.mjs" \
  --sandbox=/tmp/skill-migrate-<id>-46 \
  --prompt="<the eval prompt>" \
  --skill=<path-to-target-SKILL.md> \
  --model=claude-opus-4-6 \
  --out=.skill-migrate/discovery/<id>/run-46

# Run on target
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/run-eval.mjs" \
  --sandbox=/tmp/skill-migrate-<id>-target \
  --prompt="<the eval prompt>" \
  --skill=<path-to-target-SKILL.md> \
  --model=<target-model> \
  --out=.skill-migrate/discovery/<id>/run-target
```

### Diff the runs

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/diff-runs.mjs" \
  --run-a=.skill-migrate/discovery/<id>/run-46 \
  --run-b=.skill-migrate/discovery/<id>/run-target \
  --out=.skill-migrate/discovery/<id>/diff.json
```

The diff reports: tools called by one model but not the other, different
tool counts, different error patterns, different agent types dispatched,
and repo state differences (files modified/created by one but not the
other, or with different content).

Do not clean up sandboxes until Phase 5 is done.

## Phase 5: Difference analysis

Read the diff output. For each behavioral difference, judge which model
did it better. This is the step that turns raw diffs into benchmark targets.

For each difference, classify:

| Verdict | Meaning | Becomes assertion? |
|---|---|---|
| 4.6 better | 4.6 did this right, target model missed it | Yes - target the 4.6 behavior |
| Target better | Target model improved on 4.6 | Yes - target the new behavior |
| Both same | No meaningful difference | No |
| Cosmetic | Different approach, same outcome | No |

### Minimum assertion count

The final benchmark needs at least 10 discovery-derived assertions. These
are the primary metric. If the discovery diff produced fewer than 10
differences with a clear winner, the scenarios were too simple. Go back to
Phase 4 and add a scenario with more complexity, more ambiguity, or a
different part of the skill's behavior. Repeat until you reach 10.

Contract-based assertions (marked `"source": "contract"`) are secondary.
They catch regressions but cannot show improvement. Keep them, but never
count them toward the minimum of 10.

### Assertion types

Use the full range of assertion types that `grade-eval.mjs` supports.
Binary `tool_called` checks have low discriminating power. Two models that
both call the same tool still differ in how many times, in what order,
what they produce, and what they leave behind.

| Type | What it measures | Example |
|---|---|---|
| `tool_called` / `tool_not_called` | Did the model use the right tool? | Agent with "blind-writer" |
| `tool_count` (min/max) | Efficiency, retry behavior | Agent calls between 2-4, not 8 |
| `tool_order` | Sequencing and judgment | Quarantine before writer dispatch |
| `file_modified` | Did the model change the right files? | Target file was rewritten |
| `file_not_modified` | Did it leave the wrong files alone? | Unrelated module untouched |
| `file_created` | Did it produce expected artifacts? | Contract file exists |
| `file_contains` | Outcome quality | Rewritten file has required content |
| `file_not_contains` | Avoided copying | Rewritten file lacks old interior name |

Prioritize assertions that test outcome and judgment over assertions that
test recipe-following. "Did it produce the right result" matters more than
"did it call the right tool."

Write each assertion as an eval case:

```json
{
  "id": "agent-dispatch-gap",
  "prompt": "...",
  "source": "discovery",
  "claim": "Target model skips Agent dispatch that 4.6 does correctly",
  "better_model": "4.6",
  "fixtures": { ... },
  "assertions": {
    "tool_calls": [
      {"type": "tool_called", "tool": "Agent", "args_contain": "step-implementer"},
      {"type": "tool_count", "tool": "Agent", "min": 2, "max": 5}
    ],
    "repo_state": [
      {"type": "file_contains", "path": "src/scorer.js", "string": "export function"},
      {"type": "file_not_contains", "path": "src/scorer.js", "string": "oldInternalName"}
    ]
  }
}
```

Save cases to `.skill-migrate/cases/` and the judgment table to
`.skill-migrate/discovery/judgments.json`.

Show the cases and judgments to the user. Wait for approval.

Clean up sandboxes after approval.

## Phase 6: Quarantine and blind rewrite

### Quarantine

```bash
mkdir -p .skill-migrate/quarantine
cp <path-to-target-SKILL.md> .skill-migrate/quarantine/original-SKILL.md
```

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
3. No verification scaffolding.
4. Explicit scope where the original relies on inference.
5. Principles over rule lists.
6. Script references where the original uses prose rules.

Audience: a Claude model running in Claude Code with tool access.
Register: direct, technical.
Length: aim for {50-70% of original line count} lines.

Banned paths (do not read):
- {quarantine path}
- {any other copies found in Phase 0 leak sweep}
```

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
contract. Repair every gap it reports.

An item the analyst tagged SCAFFOLDING or ACCIDENTAL that the user confirmed
dropping is not a gap.

## Phase 10: Benchmark after

Run the approved eval cases against `.skill-migrate/migrated-SKILL.md`.
Report discovery and contract results separately. Discovery assertions
are the primary verdict. Contract assertions catch regressions only.

### Target model

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/run-eval.mjs" \
  --sandbox=/tmp/skill-migrate-<id> \
  --prompt="<the eval prompt>" \
  --skill=.skill-migrate/migrated-SKILL.md \
  --model=<target-model>
```

Grade with `grade-eval.mjs`, aggregate, and compare with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/compare-runs.mjs" \
  --before=.skill-migrate/runs/before/benchmark.json \
  --after=.skill-migrate/runs/after/benchmark.json
```

If a discovery-derived assertion fails, check whether the new skill dropped
the corresponding claim. If so, dispatch the writer to add it.

### 4.6 compatibility

Run the same cases against the migrated skill on `claude-opus-4-6`.

A simpler, more explicit skill should work better on 4.6, not worse. If a
case regresses, edit the migrated skill to make that claim clearer without
adding scaffolding back. Allow two edit-and-rerun cycles.

## Phase 11: Report

Split discovery results from contract results. Discovery is the primary
verdict. A migration that passes all contract assertions but fails
discovery assertions has not improved the skill.

```
Skill           <name>
Target model    <model>
Verdict         accepted | partial | rejected

Discovery assertions (primary)
                pass_rate    total
Target          <n>/<m>      <m>
4.6             <n>/<m>      <m>

Contract assertions (secondary)
                pass_rate    total
Target          <n>/<m>      <m>
4.6             <n>/<m>      <m>

                tokens    lines
Before          <val>     <original lines>
After (target)  <val>     <migrated lines>
After (4.6)     <val>     <migrated lines>

Scaffolding dropped   <n items>
Claims preserved      <n of m>
Overlap gate          <run score> / <ngram score>

Discovery summary
  Scenarios run            <n>
  Differences found        <n>
  Assertions written       <n> (minimum 10)
  Targeted (4.6 better)    <n>
  Targeted (target better) <n>
  Cosmetic/same            <n>
```

Then a per-assertion table with: assertion id, what it measures, assertion
type (tool_count / file_contains / etc.), which model was better in
discovery, pass/fail on target, pass/fail on 4.6.

End with the diff between the original and migrated SKILL.md. Do not apply
it. The caller decides whether the migration lands.

## Rules

1. **One skill per invocation.** Mixing skills produces shallow analysis.
2. **Discover before asserting.** Run both models first, then write
   assertions from measured differences. Never write speculative assertions.
   The benchmark needs at least 10 discovery assertions. If discovery
   produced fewer than 10, the scenarios were too simple.
3. **Delete before dispatching the writer.** A writer that reads the original
   reproduces it.
4. **Assert on actions and repo state.** Never grade on output text.
   Prefer outcome assertions (`file_contains`, `file_not_contains`,
   `tool_count`) over binary presence checks (`tool_called`). A benchmark
   made of `tool_called` checks cannot distinguish recipe-following from
   good judgment.
5. **Judge each difference.** Neither model is always right. The target
   behavior is whichever model did it better.
6. **The 4.6 gate runs last.** A simpler skill should not regress on 4.6.
7. **The human prunes OBSERVED.** Never decide which scaffolding to drop
   without asking.
8. **Do not apply the migration.** Show the diff. The caller decides.
9. **Shorter is the target.** A migration that makes a skill longer has
   failed the premise.
