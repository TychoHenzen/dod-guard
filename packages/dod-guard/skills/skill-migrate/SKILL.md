---
name: skill-migrate
description: >-
  Migrate a skill to work on post-4.6 Claude models by blind-rewriting it from
  a behavioral contract. Extracts what the skill accomplishes, classifies which
  instructions are scaffolding written for 4.6, deletes the SKILL.md, and has a
  blind writer rebuild it for the target model. One skill per invocation.
  TRIGGER when: user says "migrate this skill", "tune for Opus 5", "make this
  work on newer models", "fix skill for literal models".
  DO NOT TRIGGER for writing a new skill (that is /skill-creator) or debugging
  a skill from transcripts (that is /skill-debug).
argument-hint: "<skill name or path to SKILL.md>"
---

# Skill Migrate

Take a skill that works on Opus 4.6. Rebuild it from what it accomplishes, not
from what it says. Gate on structural quality. Test in the field.

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
7. **Cap delegation.** Post-4.6 models delegate to subagents more readily.
   Explicit caps prevent cost multiplication on small tasks.
8. **Full task up front.** Post-4.6 models do worse with drip-fed instructions.
   Give the complete specification in one pass.
9. **Handle contradictions.** Overlapping or conflicting instructions cause
   newer models to stall or bail. Remove the contradiction rather than
   expecting the model to resolve it.
10. **No worked examples that constrain exploration.** Examples lock the model
    into one approach. State the goal and let it explore.

## Phase 0: Read and baseline the skill

Read the target SKILL.md, every agent it dispatches (find `subagent_type`
references), and every script it calls (find `${CLAUDE_PLUGIN_ROOT}` paths
or `node` commands in fenced blocks).

### Baseline check

Run the migration checker against the original before anything changes:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/migration-check.mjs" \
  <path-to-target-SKILL.md> \
  --save=.skill-migrate/baseline.json
```

This records every check (line count, frontmatter, scaffolding patterns,
scope, delegation caps, worked examples, contradictions, terminology) as a
baseline for the after comparison in Phase 8.

### Inventory

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

## Phase 4: Quarantine and blind rewrite

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
3. No verification scaffolding - the model verifies its own work.
4. Explicit scope where the original relies on inference.
5. Principles over rule lists.
6. Script references where the original uses prose rules.
7. Cap subagent delegation where the original is silent on it.
8. Full task spec in each phase, not drip-fed across phases.
9. Remove contradictory or overlapping instructions.
10. No worked examples that constrain exploration.

Audience: a Claude model running in Claude Code with tool access.
Register: direct, technical.
Length: aim for {50-70% of original line count} lines.

Banned paths (do not read):
- {quarantine path}
- {any other copies found in Phase 0 leak sweep}
```

Combine the kept frontmatter with the writer's output into the migrated
SKILL.md at `.skill-migrate/migrated-SKILL.md`.

## Phase 5: Verify claim coverage

Walk every REQUIRED claim and every kept OBSERVED claim. Find where the new
skill carries each one. A claim you cannot point at is a gap. Redispatch the
writer with that claim named.

## Phase 6: Overlap gate

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

## Phase 7: Gap audit

Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned
contract. Repair every gap it reports.

An item the analyst tagged SCAFFOLDING or ACCIDENTAL that the user confirmed
dropping is not a gap.

## Phase 8: Migration gate

Run the migration checker against the migrated SKILL.md, comparing against
the Phase 0 baseline:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/migration-check.mjs" \
  .skill-migrate/migrated-SKILL.md \
  --before=.skill-migrate/baseline.json
```

Exit 0 means no regressions. Exit 1 means a check that passed before now
fails. Fix regressions before reporting.

The checker tests these requirements from the post-4.6 target:

| Check | What it catches |
|---|---|
| line-count | Body over 500 lines (warns over 300) |
| name-format | Name not lowercase/hyphens/1-64 chars |
| description-present | Empty or over 1024 chars |
| description-person | First/second person in description |
| no-at-imports | `@`-imports (only work in CLAUDE.md) |
| no-scaffolding | Verification reminders, forced progress, reasoning extraction |
| no-conservative-filters | "be conservative", "only report high-severity" |
| no-bare-negatives | "never X" without a path forward |
| no-implicit-scope | "apply the formatting" without "every/all/each" |
| no-drip-fed | "see Phase N above", "as described earlier" |
| no-redundant-repetition | Same instruction stated twice (trigram similarity) |
| explicit-scope | No scope markers |
| delegation-cap | Dispatches subagents without a cap |
| no-constraining-examples | Long worked examples (>15 non-script lines) |
| no-contradictions | "must X" paired with "must not X" |
| consistent-terminology | Same concept spelled multiple ways |

## Phase 9: Report

```
Skill           <name>
Target model    <target>
Verdict         accepted | rejected

                lines
Before          <original lines>
After           <migrated lines>

Scaffolding dropped   <n items>
Claims preserved      <n of m>
Overlap gate          <run score> / <ngram score>
Migration check       <passed>/<total> (before: <passed>/<total>)
Regressions           <n>
Fixed                 <n>
```

End with the before/after migration check comparison, then the diff
between the original and migrated SKILL.md. Do not apply the migration.
The caller decides whether it lands.

## Rules

1. **One skill per invocation.** Mixing skills produces shallow analysis.
2. **Delete before dispatching the writer.** A writer that reads the original
   reproduces it.
3. **The human prunes OBSERVED.** Never decide which scaffolding to drop
   without asking.
4. **Do not apply the migration.** Show the diff. The caller decides.
5. **Shorter is the target.** A migration that makes a skill longer has
   failed the premise.
