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
---

# Skill migrate

Migrate one artifact per call; batching is out of scope. Run phases 0 to 9 in order. Read and apply `standards/working-defaults.md`; stricter rules here win. Never apply the result: the migration ends at the diff, and the caller decides whether to land it. A migration that grows the artifact has failed; shorter is success.

## Paths and agents

- `<skill-dir>`: `${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate` (Claude) or the directory holding the loaded SKILL.md (Codex).
- `<dod-guard-skills-dir>`: the parent of `<skill-dir>`.
- `<agent-definitions-dir>`: `${CLAUDE_PLUGIN_ROOT}/agents` (Claude) or the `agents` directory beside the parent `skills` directory (Codex).

Resolve these and confirm each script exists before running any. If one fails, end the turn naming the path.

Spend at most four dispatches: `dod-guard:blind-prose-contract-extractor`, `dod-guard:migration-analyst`, `dod-guard:blind-prose-writer`, and `dod-guard:blind-gap-auditor`. On Codex use `dod_guard_<name>`. With no registered custom agent, read `<agent-definitions-dir>/<name>.md` and spawn `explorer` (no Write or Edit in its tools) or `worker`, embedding the definition body and briefing. Clean-context, model-separation, dispatch-cap, and return-shape rules still hold.

On Codex, inspect the active agent list and reuse a related agent where practical. Size each wave to free slots, wait, record all results, then close finished agents (interrupt unneeded ones if close is unavailable). A returned result does not prove a slot is free: if full, release unneeded agents and retry once, else reuse an agent by follow-up.

## Phases

**0. Inventory.** Read the target, then run:

```bash
node "<skill-dir>/scripts/migration-check.mjs" <path-to-target> --save=.skill-migrate/baseline.json
```

It prints the kind (`skill`, `agent`, `claude-md`, `memory`, `instinct`); override with `--kind=<k>`. Pass the kind to every agent. Trace by kind: skill, each `subagent_type` and script call to its file; agent, its dispatching skills and the report format its caller parses; CLAUDE.md, the commands, paths, and gates named; memory or instinct, whether each fact still holds. Write an inventory: one-sentence goal, trace, dispatches with return shapes, script exit codes, rules.

**1. Contract.** Dispatch the extractor with inventory and kind. It returns REQUIRED claims, OBSERVED claims, verbatim text, a dependency census, and banned vocabulary.

**2. Classification.** Dispatch `migration-analyst` with contract, inventory, and kind. It labels each OBSERVED item ESSENTIAL, SCAFFOLDING (compensates for 4.6 limits), or ACCIDENTAL (phrasing artifact, dropped automatically). Advisory.

**3. Human confirmation.** The only step that blocks on the user. Show all REQUIRED claims, every tagged OBSERVED claim, and the full SCAFFOLDING list. Ask which SCAFFOLDING to cut, which OBSERVED items are missed requirements, and whether any REQUIRED claim is wrong. Wait for the answers.

**4. Blind rewrite.** Move the source to `.skill-migrate/quarantine/original.md` and clear its body below the frontmatter. Dispatch the writer with the pruned contract (REQUIRED plus approved OBSERVED), inventory, targets below, audience (Claude model in Claude Code), direct technical register, and banned read paths (quarantine directory, plugin-cache copies). Merge the original frontmatter with its output into `.skill-migrate/migrated.md`.

Post-4.6 targets:

1. Cut to 50-70% of source lines.
2. Describe outcomes and acceptance criteria; let the model pick methods.
3. Drop verification scaffolding.
4. Name scope left implied.
5. Prefer a principle over an enumerated checklist.
6. Point at a script gate instead of restating it.
7. Set an explicit ceiling on subagent dispatches.
8. Give each phase full context, no backward pointers.
9. Resolve contradictions and overlapping directives.
10. Omit long worked examples that funnel toward one solution.

Memory and instinct files: put every factual assertion (path, number, command, flag, date, name) in Verbatim; the writer reproduces each exactly and rewrites only the framing. A fact is never SCAFFOLDING. In phase 7 every dropped claim is a gap.

**5. Claim coverage.** Map each REQUIRED and kept OBSERVED claim to a sentence in `migrated.md`. Name any unmapped claim and send the writer back.

**6. Overlap.**

```bash
node "<dod-guard-skills-dir>/blind-rewrite/scripts/overlap-scan.mjs" --mode=prose --original=.skill-migrate/quarantine/original.md --rewrite=.skill-migrate/migrated.md --contract-file=<path-to-verbatim-file>
```

Exit 0 is a genuine rewrite. Exit 1 is cosmetic: redispatch the writer, saying only "too close".

**7. Gap audit.** Dispatch `blind-gap-auditor` with both versions and the pruned contract. Repair every dropped claim. For skill, agent, or CLAUDE.md, a SCAFFOLDING or ACCIDENTAL item the user confirmed dropping is no gap.

**8. Regression.**

```bash
node "<skill-dir>/scripts/migration-check.mjs" .skill-migrate/migrated.md --before=.skill-migrate/baseline.json
```

Exit 0 passes. Exit 1 means a previously passing check now fails; fix every one. Exit 3 means the baseline is a different kind, so the comparison is refused. The script scores everything else. An agent declares `tools`, or omits it and sets `inheritAllTools: true`; both fails.

All four gates (claim coverage, overlap, gap audit, regression) must pass before the report ships.

**9. Deliver.** Summarize before and after numbers, append the migration-check output, then the full diff. Stop.
