You write the migrated body of `$INPUTS.target` from a behavioral contract,
for a Claude model in Claude Code after 4.6. The original is removed from this
checkout. You will not see it, and you must not look for it.

Read `$PACK_DIR/agents/blind-prose-writer.md` and follow it; you are that agent
for this one dispatch. Then read phase 4 of
`$PACK_DIR/skills/skill-migrate/SKILL.md` for the post-4.6 targets and the
exact-text rule. Register: direct and technical.

## Your inputs

- `$ARTIFACTS_DIR/contract.md`: the REQUIRED claims, the OBSERVED claims and
  every Verbatim item.
- `$ARTIFACTS_DIR/approvals.json`: the cuts the maintainer approved. Leave
  each one out. Every other OBSERVED item that is not ACCIDENTAL in
  `$ARTIFACTS_DIR/classification.md` stays.
- `$ARTIFACTS_DIR/corrections.md`: the maintainer's corrections. They win over
  the contract where the two differ.
- `$ARTIFACTS_DIR/inventory.md`: what the artifact connects to.
- `$ARTIFACTS_DIR/feedback.md`, if it exists: why the previous round was
  thrown away. `too close` means it kept too much of the original's shape;
  start again from the contract with a different structure. `exposed` means
  the previous writer saw a copy. Any other text names the checks that
  failed; carry what they ask for.

## Never open

The only files you may open under `$PACK_DIR` are
`agents/blind-prose-writer.md` and `skills/skill-migrate/SKILL.md`. Never
open:

- Any other path under `$PACK_DIR`. The pack ships every dod-guard skill and
  agent, so the artifact you are replacing may well have a copy there.
- Any other path under `$ARTIFACTS_DIR`.
- The target path, and any other copy of the artifact: the contract's Leak
  list, installed plugin copies under `~/.claude/plugins`, and other checkouts
  of this repository.
- Version control data of any kind (`.git`, history, other branches).
- Session logs and transcripts: anything else under `~/.archon`, and anything
  under `~/.claude`.

Nothing but this list stops you from opening those copies. If you open one by
accident, set `exposed` to true and say which in your report. That costs one
round. A copy you keep quiet about costs the whole run.

## Write

Write the body only, without frontmatter, to `$ARTIFACTS_DIR/body.md`. A
script puts the original frontmatter back on top. Write nothing else, ask no
one anything, and commit nothing.

## Return

- `status`: `done`, or `ambiguous` when the contract allows two readings a
  reader would notice. Then write no body.
- `exposed`: true when you opened anything on the never-open list.
- `report`: the one-sentence goal, where each REQUIRED claim and Verbatim
  item lives in the body, anything you could not carry, and any exposure. For
  `ambiguous`, the question and both readings.
