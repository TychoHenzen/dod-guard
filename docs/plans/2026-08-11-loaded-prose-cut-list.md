# Loaded prose cut list

Status: the user approved the Cut candidates table on 2026-08-11 and it has
been applied. The "Do not cut" section below was kept whole. Pre-cut copies
of both edited files sit in `~/.claude/.backups/2026-08-11-prose-cut/`.

Applying the table cost 5 lines more than the 42 it listed. Removing all six
`SENTENCES` bullets left that heading with no body, and one surviving `VERBS`
bullet ended by pointing at a rule that was now gone. Both were repaired by
deleting the orphaned heading and the dangling clause. Final counts:
`enforcement.md` 132 to 89 lines, `dod-guard/CLAUDE.md` 206 to 202.

The rule in the `dod-guard/CLAUDE.md` cut was not lost. `INSTINCTS.md` line 13
still states it.

## Summary

Every session on this machine loads six files, not four. The source plan
named `dod-guard/CLAUDE.md`, the global `CLAUDE.md`, `enforcement.md`, and
`INSTINCTS.md`, and missed `RTK.md` and `liedetector.md`. Both load through
`@` imports at the top of the global `CLAUDE.md` and cost the same as any
other loaded line.

| File | Lines |
|------|-------|
| `dod-guard/CLAUDE.md` (this repo only) | 206 |
| `~/.claude/CLAUDE.md` (global) | 170 |
| `~/.claude/enforcement.md` (global, via import) | 132 |
| `~/.claude/instincts/INSTINCTS.md` (global, via import) | 31 |
| `~/.claude/RTK.md` (global, via import) | 29 |
| `~/.claude/liedetector.md` (global, via import) | 30 |

The four files the source plan named total 539 lines. All six total 598.
The plan's 250-line target covered only the four named files. The gap
against that target is 289 lines. The plan expected a gap of only 255
lines, from a 505-line estimate that missed two files.

Two findings that bear on the budget but are not cut candidates:

- Adopting the OpenSpec CLI added zero always-loaded lines. Version 1.8.0
  generates no `AGENTS.md`. It writes 6 slash commands and 6 skills into
  `.claude/`, 2266 lines total, but a command or skill loads only when
  invoked. The source plan assumed an `AGENTS.md` would eat into the
  budget. It does not exist.
- `enforcement.md` opens with a `## Response style scope` section about a
  response style called caveman mode. The Natural output style replaced
  it. This is confirmed against `plugins/natural-output-style` and the
  project's own memory note on the switch. That section is stale. It is
  in the table below.

## Cut candidates

Sorted by lines saved, largest first, with a running total.

| File | Lines | Count | Reason | Running total |
|------|-------|-------|--------|---------------|
| `enforcement.md` | 1-9 | 9 | Stale. Describes caveman mode, a response style the Natural output style replaced. | 9 |
| `enforcement.md` | 27-32 | 6 | Duplicates a hook rule. `ste-lint`'s `acronymRule` (`rules-acronym.mjs`) already expands or flags unexplained acronyms on every write. | 15 |
| `enforcement.md` | 58-63 | 6 | Duplicates a hook rule. `ste-lint`'s `tangledSentenceRule` (`rules-syntax.mjs`) already flags a stretched auxiliary, a wedged clause, and passive voice under the `tangled-sentence` rule. | 21 |
| `enforcement.md` | 43-46 | 4 | Duplicates a hook rule. `ste-lint`'s `vocabularyRules` (`rules-vocabulary.mjs`) already flags nominalizations under `nominalization` and filler openers under `filler`. | 25 |
| `enforcement.md` | 54-57 | 4 | Duplicates a hook rule. `ste-lint`'s `nounStackRule` (`rules-structure.mjs`) already flags a stack of four or more content words carrying two or more abstract nouns. | 29 |
| `enforcement.md` | 22-24 | 3 | Duplicates a hook rule. `ste-lint`'s `vocabularyRules` (`vocabulary.mjs` `BANNED_WORDS`) already flags `leverage`, `utilize`, `facilitate`, and the other listed swaps under `slop-word`. | 32 |
| `enforcement.md` | 49-51 | 3 | Duplicates a hook rule. `ste-lint`'s `longSentenceRule` and `semicolonRule` (`rules-prose.mjs`) already flag the sentence cap and any semicolon on every write. | 35 |
| `dod-guard/CLAUDE.md` | 185-187 | 3 | Duplicates another loaded file. `INSTINCTS.md` line 13 already states "when revising functionality, replace the old approach entirely. Never add backward-compatibility shims, feature flags, or fallback paths" as a global rule. | 38 |
| `enforcement.md` | 33-34 | 2 | Duplicates a hook rule. `ste-lint`'s `vocabularyRules` (`vocabulary.mjs` `BANNED_WORDS`) already flags `seamless`, `robust`, `powerful`, `comprehensive`, `cutting-edge`, `world-class`, `next-generation`, and `effortless` under `slop-word`. | 40 |
| `enforcement.md` | 52-53 | 2 | Duplicates a hook rule and another loaded file. `ste-lint`'s `punctuationRule` (`rules-prose.mjs`) already blocks every em dash spelling on every write, and the global `CLAUDE.md`'s "No em-dashes, ever" section (lines 10-26) already states the same rule for this repo's writing. | 42 |

Total saved if every row is cut: 42 lines. That is small next to the
598-line real total and the 250-line target for the four named files.

## Do not cut

Blocks considered and rejected. Each one holds a rule nothing else in the
loaded set enforces.

- **`enforcement.md` 11-21, 25-26, 35-42, 47-48** (Writing section framing
  and the untouched WORDS/VERBS bullets). Holds the rule that one name
  should serve one thing, that a specialist term needs one explaining
  clause, and the active-voice guidance. `ste-lint` has no rule against
  renaming the same concept mid-document or against general passive
  voice outside the narrow tangled-sentence strain test. This framing
  also names the tiers (strict vs. flavored) other bullets refer to.
- **`enforcement.md` 65-68** (STRUCTURE: one topic per paragraph, numbered
  steps, condition before command). No rule in `rules-structure.mjs`,
  `rules-prose.mjs`, or any other rule module checks paragraph length,
  list formatting, or clause order. This is the only place that rule
  lives.
- **`enforcement.md` 70-79** (tier explanation: strict vs. flavored word
  caps and readability ceilings). This is reference information a writer
  needs to know which cap applies to which file. The hook enforces the
  caps but never explains which tier a given file falls under.
- **`enforcement.md` 84-100** (how to run `ste-lint` directly, the
  three-new-violation budget per write, and the `.prose-skip` waiver
  mechanism). This describes the hook's own runtime behavior. Nothing
  else states the waiver commands or the per-write budget. The word
  "rtk's" here is a proper noun, the tool name plus a possessive, and
  stays as written.
- **`enforcement.md` 105-132** (Code structure: ratchet, not absolute).
  Describes `quality-guard`'s file scanner and its hard and preferred
  bounds. No loaded file restates this, and no hook prose duplicates it.
  This section is the only description of that scanner's rules
  available to the model.
- **Global `CLAUDE.md` 10-26** (No em-dashes, ever). Kept over cutting.
  `enforcement.md` 52-53 duplicates it, and `punctuationRule` enforces it
  mechanically, but this section carries content nothing else states.
  It names the corruption mechanism, UTF-8 read back as cp1252. It also
  states the exception for quoted text and for content not otherwise
  being edited. The hook blocks the character. It explains neither the
  exception nor the reason.
- **`INSTINCTS.md`** (all rows). Every line is the record `/learn`
  distilled from past sessions. No other loaded file restates a workflow
  instinct, a communication habit, or a writing habit for
  non-specialist audiences. None restates the failing-tests rule
  either. Cutting a row here means losing a lesson that cost a real
  session to learn. That is a different kind of decision than trimming
  a restated rule.
- **`RTK.md`** (all 29 lines). Usage reference for an external CLI tool.
  Nothing else loaded states rtk's commands or the name collision
  warning. It is not a duplicate, not stale, and no hook enforces it.
- **`liedetector.md`** (all lines). States the tagging protocol for
  research claims. No hook enforces citation tags, and no other loaded
  file states this protocol.
- **`dod-guard/CLAUDE.md`** (everything except 185-187). Repo-specific
  build, publish, and architecture rules. Checked against the other five
  files for overlap. Only the backwards-compatibility line duplicates
  INSTINCTS. The rest, including the publish workflow, the CI gate
  table, the MCP server guard pattern, and the OS-awareness section, has
  no counterpart anywhere else loaded.

## Is 250 reachable

No. The cuts in the table above save 42 lines against the four named
files. Those total 539 lines, and all six total 598. Even after every
listed cut, the four named files land at roughly 497 lines. That is
still well above 250.

Getting to 250 needs a different kind of decision than pruning
duplicates. The user would need to pick which real, non-duplicated
rules to drop outright. An alternative moves rules out of the
always-loaded path, into a skill or command that loads only when
invoked. OpenSpec's skills and commands already work that way. Either way
this is a scope call for the user. This audit cannot resolve it by
finding more redundancy. The redundant material in `enforcement.md` is
close to exhausted once the rows above are cut.
