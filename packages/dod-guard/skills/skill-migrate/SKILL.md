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

## Benchmark sandbox

The scripts under `scripts/` form a pipeline that builds a mutation-based
benchmark corpus and scores a skill against it. This is separate from the
discovery-run flow in Phase 4-10 above, which diffs two models on the same
skill. The benchmark sandbox instead measures how well a skill (any skill,
not only a migrated one) repairs known damage in real-world code.

### mine-github.mjs

Pulls source files from the GitHub code search API into a local corpus.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/mine-github.mjs" \
  --language=ts --min-stars=100 --max-file-size=15000 --count=20 \
  --out=.skill-migrate/corpus
```

Key flags: `--language` (`ts`, `js`, `py`, `rs`, `go`, required), `--min-stars`
(default 100), `--max-file-size` in bytes (default 15000), `--count` (default
20), `--out` (default `.skill-migrate/corpus`). Requires `GITHUB_TOKEN` in the
environment to avoid the anonymous rate limit. Each saved file gets a
`<file>.meta.json` sidecar recording `repo`, `stars`, `language`, `url`,
`path`, `sha`, and a content hash used to skip duplicates.

### mutate-code.mjs

Injects synthetic bugs into one file, seeded so the same seed always produces
the same mutations.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/mutate-code.mjs" \
  --input=src/example.ts --out=/tmp/mutated.ts --count=3 \
  --types=rename,dead-code,shuffle,bug --seed=1
```

Mutation types: `rename` (identifier renamed), `dead-code` (unreachable code
inserted), `shuffle` (statement order changed), `bug` (a comparison or
arithmetic operator swapped). The `--seed` flag drives a small linear
congruential generator (`seededRandom`), so `--seed=1` always yields the same
mutation sequence for the same input. Each mutation is recorded in a
`<out>.mutations.json` sidecar, which `check-properties.mjs` reads back to
score whether a fix restored the original behavior.

### check-properties.mjs

Compares a processed result file against its original (oracle) version.

Checks: `syntax_valid` (language-specific parse check: `node --check` for
JS, `tsc --noEmit` for TS, `py_compile` for Python). `behavior_score`
measures line-level similarity between result and oracle (0.0-1.0).
`mutations_fixed` counts how many recorded mutations were reverted.

Graceful degradation: when no checker exists for a language (Rust, Go),
or the binary is missing, `syntax_valid` returns `null` instead of
failing. A missing checker never blocks scoring.

### generate-scenarios.mjs

Turns a mined corpus into eval-case JSON files, one per file (or per group of
files, with `--scenario-size`). Each scenario mutates its source, embeds the
mutated file as `src/<name>`, and embeds the untouched original plus its
mutation record as `oracle/<name>` and `oracle/<name>.mutations.json` fixtures.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/generate-scenarios.mjs" \
  --corpus=.skill-migrate/corpus --out=.skill-migrate/scenarios --seed=1
```

Key flags: `--corpus` and `--out` (both required), `--mutations-per-file`
(default 2), `--mutation-types` (default all four), `--seed` (default 1).
Optional: `--prompt-template` (default asks the model to review and fix
`{file}`), `--scenario-size` (default 1, files per scenario).

### benchmark.mjs

End-to-end harness. For each scenario: sets up a sandbox, runs the skill,
extracts actions, grades assertions, and checks properties against the
oracle. Writes `benchmark.json` (full detail) and `runs.json` (the
`{runs:[...]}` shape that `compare-runs.mjs` reads).

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate/scripts/benchmark.mjs" \
  --scenarios=.skill-migrate/scenarios --skill=<path-to-SKILL.md> \
  --model=<model-id> --out=.skill-migrate/runs/before
```

`--dry-run` skips execution entirely and only validates every scenario file's
shape (required `id`, `prompt`, `fixtures.files` with `inline:`/`copy:`
values). It needs only `--scenarios`, not `--skill` or `--model`, and prints
`{count, invalid, results}`. Use it to catch a malformed scenario before
spending eval budget on it.

The aggregate metrics in `benchmark.json` (`aggregate` field): `mean_pass_rate`
(from grade assertions, when the scenario has any), `mean_behavior_score`,
`mutations_fixed_rate` (fixed mutations over total mutations across every
scenario), `syntax_valid_count` / `syntax_invalid_count`, `mean_tokens`, and
`mean_duration_ms`.

### The full flow

```bash
# 1. Mine real-world source files into a corpus
node scripts/mine-github.mjs --language=ts --out=.skill-migrate/corpus

# 2. Turn the corpus into mutated eval scenarios
node scripts/generate-scenarios.mjs \
  --corpus=.skill-migrate/corpus --out=.skill-migrate/scenarios

# 3. Run the skill under test against every scenario
node scripts/benchmark.mjs \
  --scenarios=.skill-migrate/scenarios --skill=<skill-under-test>.md \
  --model=<model-id> --out=.skill-migrate/runs/before

# ...repeat step 3 against the migrated skill, writing to runs/after...

# 4. Compare before and after
node scripts/compare-runs.mjs \
  --before=.skill-migrate/runs/before/benchmark.json \
  --after=.skill-migrate/runs/after/benchmark.json
```

`compare-runs.mjs` reads the two `benchmark.json` files, matches scenarios by
`eval_id`, and reports per-scenario and aggregate deltas in `pass_rate`,
`tokens`, and `tool_calls`.

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
