---
name: blind-rewrite
description: >-
  Replace an implementation by deleting it first, then rebuilding it from a
  contract that a fresh agent receives without ever seeing the old code. Fixes
  the failure where a model asked for a complete rewrite returns a renamed
  variable. Ships an overlap gate that scores the result against the deleted
  original and rejects paraphrase. Handles a new interior behind an existing
  seam, seam extraction first, dependency swaps, and prose with no test
  harness. TRIGGER when: user says "rewrite this properly", "complete
  rewrite", "no cosmetic changes", "replace X with Y", "swap this library",
  "change this algorithm", "rewrite this paragraph", "rewrite this section",
  "this doc buries the point", or a previous rewrite attempt came back as a
  cosmetic edit, code or prose. DO NOT TRIGGER for ordinary edits, bug fixes,
  additive features, or ordinary copy editing.
argument-hint: "[target file, module, or dependency to replace]"
---

# Blind Rewrite

Delete the target. Have a fresh agent rebuild it from a contract that records
what it did, not how it was written. Gate the result with `overlap-scan.mjs`.
The mechanism is removal: a model that cannot see the old text cannot
paraphrase it.

Three causes drive paraphrase failure. The original is an attractor, because
generation conditions on context. Bulk collapses effort, because a model
spreads attention across too many targets. Negative specs give nothing to aim
at, because "do not copy" is not a design. Blindness removes the attractor.
One target per dispatch concentrates effort. The contract gives the author a
positive target.

## The overlap gate

`overlap-scan.mjs` scores the rewrite against the quarantined original. The
author never sees either side of the comparison. `run` catches copied blocks.
The rate metrics (`ngram`, `lines`/`sentences`, `order`) catch a kept skeleton
under new names.

```
node ${CLAUDE_PLUGIN_ROOT}/skills/blind-rewrite/scripts/overlap-scan.mjs \
  --original=<paths> --rewrite=<paths> \
  [--mode=code|prose] [--whitelist=a,b,c] [--contract-file=<path>]
```

Exit 0 means rewritten. Exit 1 means cosmetic.

### Code thresholds (`--mode=code`, default)

| Metric | Limit | Min evidence | What it catches |
|--------|-------|--------------|-----------------|
| `run` | 60 tokens | none | Copied blocks |
| `ngram` | 65% of 4-token runs | 20 | Renamed skeleton |
| `lines` | 35% | 3 | Whole lines surviving |
| `order` | 0.5 similarity | 4 declarations | Same declaration sequence |

### Prose thresholds (`--mode=prose`)

| Metric | Limit | Min evidence | What it catches |
|--------|-------|--------------|-----------------|
| `run` | 15 tokens | none | Copied phrases |
| `ngram` | 20% | 20 | Shared token windows |
| `sentences` | 40% | 3 | Kept sentence in fresher words |
| `order` | 0.6 similarity | 4 sentences | Same sequence after rewording |

For prose, `sentences` catches a sentence rewritten with synonyms. `order`
catches a passage whose words moved too far for `sentences` to match but whose
sequence stayed the same. Together they cover the spectrum from light editing
to heavy synonym replacement.

A metric whose sample falls under its minimum evidence reports its value but
never fails the gate. The gate abstains entirely below roughly 40 significant
tokens.

### Whitelist and contract file

`--whitelist` holds boundary names that are required to be identical and
therefore exempt from every metric: exported symbols, error strings,
serialized keys. Everything else is the author's choice.

`--contract-file` holds `Verbatim` passages the replacement must reproduce,
one per line or as a JSON array of strings. Blank lines are skipped. Lines
starting with `#` are comments. Matching is on the token stream, so
whitespace differences do not matter. Both flags are stripped from the
comparison before any metric runs.

A rewrite that passes only because `--contract-file` grew to cover the whole
file has proved nothing.

Below roughly 40 tokens the gate abstains. Read the change yourself for
targets that small.

### Calibration

Measured against pairs in `skills/blind-rewrite/scripts/fixtures/prose/`.

Code: unrelated pairs score run 10-13. A genuine reimplementation scores 25.
A renamed copy scores 209.

Prose: an unrelated text scores run 2, ngram 0.000. A real rewrite scores
run 5, ngram 0.012. An edit scores run 57, ngram 0.921. Synonym replacement
scores run 24, ngram 0.656. Heavy synonym replacement scores run 14,
ngram 0.289, order 1.000 over 11 matched sentences.

## Four shapes

Every rewrite fits exactly one shape. Classify the target into a shape before
starting any phase. Each shape carries a different verification strategy.

### A. New interior, seam exists

A seam is a boundary of exported names, types, or tests that callers use.
The blind core is the interior behind the seam. The sighted shell is
everything outside. Only the blind core gets deleted and rebuilt. The
sighted shell stays in place and provides the oracle.

Verification uses differential testing against the quarantined copy. Both the
old code (restored from quarantine) and the new code must pass the same tests
at the seam.

### B. No seam yet

The target has no boundary callers test against. Create one first, sighted,
with tests as proof the seam works. Then proceed as shape A. Blindness covers
only the region whose design must change, nothing else.

### C. Dependency swap

Replace one dependency with another across all call sites. Shape C has no
oracle, because no test can prove the old dependency is fully gone. Census
completeness carries the whole verification load. Omission, not anchoring, is
the main risk.

Migrate call sites via `dod-guard:step-by-step`, one site per dispatch,
sighted. Bulk migration in a single dispatch reproduces cause 2: effort spread
across too many sites.

### D. Prose, no harness

The target has no test harness and no build step. The change is to the writing
itself. Shape D has no oracle. The dependency census carries the load that the
usage census carries for shape C.

Verification for shape D is claim coverage plus gap audit plus the prose
overlap gate (`--mode=prose`).

## The contract

A contract splits what from how. What includes: claims with their strength
(always, usually, sometimes, never), caveats, exceptions, `Verbatim` text
that the replacement must copy exactly, and constraints (audience, register,
length). How includes: sentences, their order, their count, vocabulary,
metaphors, examples, rhetorical shape. The extractor records what. The
author never sees how.

A contract line names a fact, not the passage. Interior names, algorithm
names, and step order stay out. A line that describes structure hands the
author the old shape.

Each claim carries a strength. The author reproduces that strength exactly.
A hedged claim flattened to a flat claim is wrong. A flat claim hedged to
sound careful is also wrong. Both are different claims, and the gap auditor
reports them.

The extractor tags each claim `REQUIRED` (an external source cites it) or
`OBSERVED` (only this passage asserts it). The human prunes the `OBSERVED`
list in phase 3.

## Phases

Exactly 10 phases, numbered 0 through 9.

### Phase 0: Classify

Assign the target to one of the four shapes. Phase 0 never decides whether
the rewrite is worth doing. The caller already made that decision.

### Phase 1: Preflight leak sweep

Find every copy of the target the author could reach: build output, bundles,
coverage, snapshots, duplicated sections, quoted excerpts in other files,
generated summaries or changelog entries. Record them as banned paths.

### Phase 2: Contract

Dispatch `dod-guard:blind-contract-extractor` for a code target.
Dispatch `dod-guard:blind-prose-contract-extractor` for a prose target.
The extractor reads the original and produces the contract. Check the
contract against the banned vocabulary before using it. An interior name
that survives into the contract anchors the replacement toward the original.

### Phase 3: Human gate

Present the contract to the user. The user prunes `OBSERVED` claims. This is
the only mandatory human step in the workflow.
Remember that the user can NOT see the agent's findings directly, you must restate them.

### Phase 4: Quarantine and delete

Save the original to `.blind/quarantine/original.<ext>`.
Then delete it from its working location. The author dispatched in phase 5
cannot see it.

### Phase 5: Blind write

Dispatch `dod-guard:blind-writer` for a code target.
Dispatch `dod-guard:blind-prose-writer` for a prose target.
One target per call. A large core needs several calls. Each call can read
output from earlier calls in the same session. Only the deleted code is
hidden - not what the author wrote this run.

### Phase 6: Verify

The author holds no shell. Run the build and tests yourself. Return failures
as text without quoting the old implementation.

**Shape A:** generate inputs across the boundary cases the contract lists.
Run them against both the quarantined copy and the new code. Require identical
results.

**Prose (shape D):** no build, no tests. Walk the `REQUIRED` list from the
pruned contract. Find where the new passage carries each claim at its recorded
strength. A missing claim is a failure. Redispatch the writer with that claim
named.

### Phase 7: Overlap gate

Run `overlap-scan.mjs` with `--original` pointing at `.blind/quarantine/` and
`--rewrite` pointing at the new file.

Exit 0: proceed to phase 8.

Exit 1: the result is cosmetic. Redispatch the author with only "too close"
as feedback. Do not tell the author which metrics breached or how the result
was close. Any detail about the resemblance anchors the next attempt to the
old text.

### Phase 8: Gap audit

Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned
contract. The auditor reports dropped behavior only. Difference is the goal,
not a defect. Fix every gap it reports. Gap fixes are sighted edits - the design is
already decided, so the orchestrator edits normally.

### Phase 9: Cleanup

Delete `.blind/` and confirm the quarantined copy is gone. End with a summary:
overlap gate scores, gap audit verdict, and which `OBSERVED` items the user
dropped.

## Escalation

Two failed cycles (write, gate, rewrite) end the run. There is no third
attempt. A second failure usually means one of three things: the contract is
incomplete, the seam is in the wrong place, or the original design was correct.

On overlap exit 1, give the author only "too close." No metric names, no
scores, no description of how the result matched the original.

When two completed rewrites both converge on the same design, the original
design was correct and the author keeps arriving at it. That is a result,
not a failure. Reaching that reading requires two completed rewrites. It is
never a prediction.
