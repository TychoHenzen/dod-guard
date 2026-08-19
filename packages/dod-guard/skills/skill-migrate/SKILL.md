---
name: skill-migrate
description: >-
  Migrate a skill, agent definition, CLAUDE.md, memory file, or instinct file to work on
  post-4.6 Claude models by blind-rewriting it from a behavioral contract. Extracts what the
  artifact accomplishes, classifies which instructions are scaffolding written for 4.6, clears
  its body, and has a blind writer rebuild it for the target model. One artifact per invocation.
  TRIGGER when: user says "migrate this skill", "migrate this agent", "tune for Opus 5", "make
  this work on newer models", "fix skill for literal models".
  DO NOT TRIGGER for writing a new skill (that is /skill-creator) or debugging a skill from
  transcripts (that is /skill-debug).
argument-hint: "<path to a SKILL.md, agent definition, CLAUDE.md, memory file, or instinct file>"
---

# Skill Migrate

One artifact per invocation. Phases execute in numeric order, 0 through 9. Do not apply every
result automatically. Show the diff instead and let the caller decide.

## Runtime paths

Resolve `<skill-dir>` before running a bundled script. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate`. In Codex, use the directory containing this loaded
`SKILL.md`. Resolve `<dod-guard-skills-dir>` as the parent of `<skill-dir>`. Confirm each resolved
script exists. If a path does not resolve, end the turn with the missing path.

## Agent dispatch compatibility

Resolve `<agent-definitions-dir>` before dispatching a dod-guard agent. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/agents`. In Codex, use the `agents` directory beside the parent `skills`
directory that contains this loaded `SKILL.md`.

For every `dod-guard:<name>` dispatch:

- Claude uses `dod-guard:<name>`.
- Codex uses `dod_guard_<name>`, with hyphens converted to underscores, when that custom agent is
  registered.
- If the Codex custom agent is unavailable, read `<agent-definitions-dir>/<name>.md` completely.
  Spawn `explorer` when its `tools` omit `Write` and `Edit`. Spawn `worker` otherwise.
  Include the definition body and task briefing in the spawn message.
- Preserve every clean-context, model-separation, dispatch-cap, and return-shape rule below.

## Four gates that reject a migration

Every migrated artifact must clear four automated gates before the report ships. Fix every
failure before moving on.

### Overlap gate (Phase 6)

```bash
node "<dod-guard-skills-dir>/blind-rewrite/scripts/overlap-scan.mjs" \
  --mode=prose \
  --original=.skill-migrate/quarantine/original.md \
  --rewrite=.skill-migrate/migrated.md \
  --contract-file=<path-to-verbatim-file>
```

Exit 0 means the text is a genuine rewrite. Exit 1 means the text is cosmetic - too close to
the original. On exit 1, redispatch `dod-guard:blind-prose-writer`. Tell it the result was too
close. Give it no other detail about how it was close.

### Gap audit (Phase 7)

Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned contract. It reports
claims the new text dropped. Repair every gap it finds.

The user may confirm dropping an item tagged SCAFFOLDING or ACCIDENTAL. For a skill, agent, or
CLAUDE.md that is no gap. For a memory or instinct file every dropped claim is a gap. That
exemption does not carry over. A memory that loses a fact is worthless.

### Regression gate (Phase 8)

```bash
node "<skill-dir>/scripts/migration-check.mjs" \
  .skill-migrate/migrated.md \
  --before=.skill-migrate/baseline.json
```

Exit 0 means no regressions against the Phase 0 baseline. Exit 1 means a check that passed
before now fails. Fix every regression before reporting.

The checker resolves the artifact kind (skill, agent, claude-md, memory, or instinct). Each kind
scores against its own weighted checklist, renormalized to 100 so kinds compare on one number.
The checklist skips frontmatter checks entirely for a CLAUDE.md. `--before` against a baseline
of a different kind refuses the comparison and exits 3. The score covers body length and
frontmatter shape. It also checks content hygiene. That means no `@`-imports, no scaffolding
patterns, no cross-phase back-references, no near-duplicates, and no dated references. Bare
negatives need alternatives, scope needs a word like every or all, and caps emphasis stops at 2.

### Claim coverage (Phase 5)

Match each REQUIRED claim and each kept OBSERVED claim to a specific sentence in the migrated
artifact. Any unanchored claim is a gap. Send the writer back with that claim identified.

## Human confirmation (Phase 3)

The only step that blocks on user input. Display all REQUIRED claims, every tagged OBSERVED
claim, and the full SCAFFOLDING list. Collect three answers: which SCAFFOLDING to cut, which
OBSERVED are missed requirements, and whether any REQUIRED claim is incorrect. Proceed only
after the user responds.

## How each actor contributes

Cap: four agent dispatches total across the entire migration.

### Contract extraction (Phase 1)

Dispatch `dod-guard:blind-prose-contract-extractor` on the target artifact with the Phase 0
inventory and its kind. It produces REQUIRED claims, OBSERVED claims, verbatim text, dependency
census, and banned vocabulary.

For a memory or instinct file, every factual assertion belongs in the Verbatim section. A fact
means a path, a number, a command, a flag, a date, or a name.

### Classification (Phase 2)

Dispatch `dod-guard:migration-analyst` with contract, inventory, and kind. It labels each
OBSERVED item:

- **ESSENTIAL** - behavior or fact the artifact depends on. Survives the rewrite.
- **SCAFFOLDING** - compensates for 4.6 limitations. Candidate for removal at the human gate.
  For a memory or instinct file, a fact is never SCAFFOLDING - only the framing around it can be.
- **ACCIDENTAL** - phrasing artifact. Dropped automatically.

### Blind rewrite (Phase 4)

Quarantine the source to `.skill-migrate/quarantine/original.md` and clear the body below the
frontmatter. The writer reads only the pruned contract. The quarantined file and any
plugin-cache copy stay off limits.

Dispatch `dod-guard:blind-prose-writer` with a briefing that contains:

- Pruned contract: REQUIRED claims plus user-approved OBSERVED claims
- Inventory: script paths with exit codes, agent names with return shapes, the frontmatter block
- The 10 post-4.6 targets
- Audience: Claude model in Claude Code
- Register: direct, technical
- Body length ceiling: 50-70% of source line count
- Banned read paths: quarantine directory and plugin-cache copies
- For a memory or instinct file: reproduce every Verbatim string exactly and rewrite only the
  framing around it

Merge the frontmatter with the writer output. Save to `.skill-migrate/migrated.md`.

## Inventory and baseline (Phase 0)

Start by reading the target artifact, then resolve its kind:

```bash
node "<skill-dir>/scripts/migration-check.mjs" \
  <path-to-target> \
  --save=.skill-migrate/baseline.json
```

The command prints the resolved kind (skill, agent, claude-md, memory, or instinct). Pass
`--kind=<k>` to override. Carry the resolved kind in every agent briefing from here on.

Trace what the kind implies. A skill traces every `subagent_type` reference to its agent
definition and every runtime path or `node` invocation to its script file. An agent
definition traces the skills that dispatch it and the report format its caller parses. A
CLAUDE.md traces the commands, paths, and gates it names. A memory or instinct file traces
whether each fact it states still holds.

Compile an inventory: one-sentence goal, the trace above, agent dispatches with return shapes,
script calls with exit-code semantics, and the rules.

## Working paths

| Path | Purpose |
|---|---|
| `.skill-migrate/quarantine/original.md` | Quarantined original |
| `.skill-migrate/migrated.md` | Writer output |
| `.skill-migrate/baseline.json` | Phase 0 migration-check snapshot |

## Post-4.6 targets

Bundle these 10 numbered items into the writer briefing.

1. Cut to 50-70% of the source line count.
2. Describe outcomes and acceptance criteria. Let the model choose methods.
3. Drop verification scaffolding. Post-4.6 models self-check.
4. Name the scope where the source left it implied.
5. Favor a guiding principle over an enumerated checklist.
6. Point at a script gate rather than restating its logic in prose.
7. Set an explicit ceiling on subagent dispatches.
8. Each phase carries its full context. No backward pointers.
9. Resolve contradictions and overlapping directives.
10. Omit long worked examples that funnel the model toward one solution.

## Deliver the result (Phase 9)

Summarize before and after numbers. Append the migration check comparison output, then the full
diff of original against migrated. Stop there. The caller decides whether to land the change.

## Constraints

- Handle a single artifact each time. Batching across artifacts is out of scope.
- Quarantine the file and clear its body before any writer dispatch. Exposure to the source
  text turns a rewrite into a copy.
- Classification is advisory. Pruning decisions belong to the user.
- The migration ends at the diff. Applying it is the caller's job.
- Shorter output signals success. A migration that grows the artifact failed.
