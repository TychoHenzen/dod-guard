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

# Skill Migrate

Read and apply `standards/working-defaults.md` from the plugin root. Stricter boundaries in this skill win.

## Constraints

- Handle exactly one artifact per run, of kind `skill`, `agent`, `claude-md`, `memory`, or `instinct`. Start a second run for a second artifact.
- Work through Phase 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 in that order.
- The run ends when the diff is on screen. The caller applies it or not.
- Local `.skill-migrate/` files are the only output. The skill has no GitHub steps.
- Cap: four agent dispatches total across the entire migration.
- A smaller artifact means the migration worked. A larger one means it failed.
- Classification only advises. The user owns every pruning decision.
- A writer that sees the source text copies it, so the source goes into quarantine before the writer starts.

## Runtime paths

Find `<skill-dir>` first. Claude: `${CLAUDE_PLUGIN_ROOT}/skills/skill-migrate`. Codex: the directory that holds the loaded SKILL.md. Then derive the others:

- `<dod-guard-skills-dir>`: the parent of `<skill-dir>`.
- `<agent-definitions-dir>`: `${CLAUDE_PLUGIN_ROOT}/agents` on Claude. On Codex, the `agents` directory next to the `skills` directory that contains this file.

Check that each script exists before relying on it. When a path does not resolve, stop and tell the user which path is missing.

| Path | Purpose |
|---|---|
| `.skill-migrate/quarantine/original.md` | Quarantined original |
| `.skill-migrate/migrated.md` | Writer output |
| `.skill-migrate/baseline.json` | Phase 0 migration-check snapshot |

## Agent dispatch compatibility

The generic form is `dod-guard:<name>`. Claude uses that name as given. Codex uses the registered custom agent `dod_guard_<name>`, with hyphens turned into underscores. If none is registered, Codex reads `<agent-definitions-dir>/<name>.md` completely, then spawns `explorer` when the definition's `tools` omit `Write` and `Edit` and `worker` otherwise. The spawn message carries the definition body and the task briefing. On every runtime the agent keeps its clean-context, model-separation, dispatch-cap, and return-shape rules.

### Codex lifecycle

- Look at the active agent list before dispatching, and reuse a related agent when that works.
- Fill a parallel wave only up to the free slots.
- After the wave finishes, record every result, then close each finished agent (interrupt it if interruption is all the runtime offers).
- A returned result does not mean the slot is free.
- Full capacity: release agents you no longer need, then retry once.
- No closure available: send a follow-up to an existing agent instead of spawning a new one.

## Phase 0: baseline and inventory

Read the target and capture the baseline. The command prints the resolved kind; `--kind=<k>` overrides the guess.

```
node "<skill-dir>/scripts/migration-check.mjs" <path-to-target> --save=.skill-migrate/baseline.json
```

Put the resolved kind into every later agent briefing. Trace what the target touches:

| Kind | Trace |
|---|---|
| skill | each `subagent_type` reference to its agent definition; each runtime path or `node` call to its script |
| agent | each skill that dispatches it; the report format its caller parses |
| claude-md | each command, path, and gate it names |
| memory, instinct | whether each stated fact is still true |

Write the inventory: one-sentence goal, the trace, agent dispatches with return shapes, script calls with exit-code meanings, and the rules.

About the checker: it resolves the kind, then scores that kind against its own weighted checklist, renormalized to 100. CLAUDE.md skips the frontmatter checks. Checks include body length, frontmatter shape, `@`-imports, scaffolding patterns, cross-phase back-references, near-duplicate lines, dated references, negatives lacking an alternative, a scope word such as every or all, and at most 2 caps-emphasis markers. An agent must declare `tools`. The exception is an agent that inherits every tool on purpose: it omits `tools` and sets `inheritAllTools: true`. Declaring both is a contradiction and fails. Comparing with `--before` against a baseline of another kind exits 3.

## Phase 1: contract extraction

Dispatch `dod-guard:blind-prose-contract-extractor` on the target, giving it the inventory and kind. Expect back REQUIRED claims, OBSERVED claims, Verbatim text, a dependency census, and banned vocabulary. When the target is a memory or instinct file, put every factual assertion (path, number, command, flag, date, name) in Verbatim.

## Phase 2: classification

Dispatch `dod-guard:migration-analyst` with the contract, inventory, and kind. It labels every OBSERVED item:

- ESSENTIAL: the artifact depends on this behavior or fact, so it stays.
- SCAFFOLDING: it exists to cover a 4.6 weakness, so the user may cut it.
- ACCIDENTAL: it is only phrasing, so it is dropped without asking.

In memory and instinct files a fact is never SCAFFOLDING, and only the framing around it can be.

## Human confirmation (Phase 3)

The only step that blocks on user input. Show the user every REQUIRED claim, every tagged OBSERVED claim, and the whole SCAFFOLDING list. Ask three questions: which SCAFFOLDING to cut, which OBSERVED items are really requirements, and whether any REQUIRED claim is wrong. Proceed only after the user responds.

## Phase 4: quarantine and write

1. Move the source into `.skill-migrate/quarantine/original.md`.
2. Empty the body under the frontmatter. Do this before any writer dispatch.
3. Dispatch `dod-guard:blind-prose-writer`. Its briefing holds:
   - the pruned contract: REQUIRED claims plus the OBSERVED claims the user approved;
   - the inventory, including script paths with exit codes, agent names with return shapes, and the frontmatter block;
   - the ten targets from the Post-4.6 targets section;
   - the audience, a Claude model in Claude Code, and the register, direct and technical;
   - a body length ceiling of 50-70% of the source line count;
   - the off-limits read paths: the quarantine directory and every plugin-cache copy;
   - for memory and instinct files, the instruction to reproduce each Verbatim string exactly and rewrite only the framing.
4. Join the original frontmatter to the writer's body and save the result as `.skill-migrate/migrated.md`.

The writer works from the pruned contract alone.

## Gates

The report waits until all four gates pass. Repair each failure, then rerun that gate.

| Gate | Check | On failure |
|---|---|---|
| Claim coverage (Phase 5) | Every REQUIRED claim and every kept OBSERVED claim maps to a named sentence in `.skill-migrate/migrated.md`. | A claim with no sentence is a gap. Return to the writer and name that claim. |
| Overlap (Phase 6) | The overlap scan, below, in prose mode. | Exit 1 means too close: redispatch `dod-guard:blind-prose-writer` and say only that the result was too close. |
| Gap audit (Phase 7) | `dod-guard:blind-gap-auditor` gets both versions and the pruned contract. | Repair every gap it reports. |
| Regression (Phase 8) | The migration-check comparison, below. | Fix each check that used to pass. |

```
node "<dod-guard-skills-dir>/blind-rewrite/scripts/overlap-scan.mjs" --mode=prose --original=.skill-migrate/quarantine/original.md --rewrite=.skill-migrate/migrated.md --contract-file=<path-to-verbatim-file>
```

```
node "<skill-dir>/scripts/migration-check.mjs" .skill-migrate/migrated.md --before=.skill-migrate/baseline.json
```

Exit codes. Overlap scan: 0 genuine rewrite, 1 cosmetic. migration-check: 0 no regressions, 1 a check that passed before now fails, 3 comparison refused.

Gap audit exemption: for a skill, agent, or CLAUDE.md, the user may confirm that dropped SCAFFOLDING or ACCIDENTAL items stay dropped. A memory or instinct file gets no exemption, and every dropped claim counts as a gap, since a memory that loses a fact is worthless.

## Post-4.6 targets

1. Land at 50-70% of the source lines.
2. Say what outcome and acceptance criteria are wanted, and leave the method to the model.
3. Remove verification scaffolding, because newer models check their own work.
4. Spell out scope where the source left it implied.
5. Favor one guiding principle over a checklist of cases.
6. Point to a script gate instead of retelling its logic.
7. Set a firm ceiling on subagent dispatches.
8. Make every phase self-contained, with no pointers to other phases.
9. Settle contradictions and overlapping directives.
10. Skip long worked examples, which steer toward a single answer.

## Deliver the result (Phase 9)

Report the before and after numbers. Add the migration-check comparison output. Finish with the full diff from the original to `.skill-migrate/migrated.md`, then stop.
