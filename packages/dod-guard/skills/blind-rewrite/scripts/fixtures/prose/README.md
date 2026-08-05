Fixtures for calibrating the prose overlap gate's thresholds
(`../lib/prose-metrics.mjs`, `DEFAULT_THRESHOLDS`).

- `base.md` - the "Why this exists" section of
  `packages/dod-guard/skills/blind-rewrite/SKILL.md` (the body, heading
  dropped), copied verbatim.
- `unrelated.md` - the "OS awareness (dod-guard)", "No backwards
  compatibility shims", and "Biome config note" sections of the monorepo
  root `CLAUDE.md`, copied verbatim except for straightening curly quotes
  and em dashes to their ASCII equivalents. A different subject from a
  different file: the floor for how much two honest passages of the same
  house style share by accident.
- `rewrite.md` - a correct blind rewrite of `base.md`: same point, own
  sentence count, own order, own wording.
- `edit.md` - `base.md` with ordinary light editing: a few words swapped, a
  clause cut, punctuation adjusted. The skeleton survives. This is the
  failure the gate must reject.
- `synonym.md` - `base.md` with the same sentences in the same order, most
  content words replaced by synonyms. The reason the `sentences` and `order`
  metrics exist.
- `synonym-heavy.md` - `base.md` with the same sentences in the same order,
  most content words replaced by heavier synonym swaps than `synonym.md`
  uses. Per-sentence similarity falls under the `sentences` metric's 0.6
  near-duplicate floor, so `sentences` cannot fire. Only `order`, with its
  own lower alignment floor, catches this one: the passage is a paraphrase
  wearing a thesaurus, walking the original in its own order.

Measurements from scoring `base.md` against each counterpart are recorded in
the comment above `DEFAULT_THRESHOLDS` in `../lib/prose-metrics.mjs`.
