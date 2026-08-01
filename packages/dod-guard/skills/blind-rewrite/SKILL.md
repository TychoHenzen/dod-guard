---
name: blind-rewrite
description: >-
  Replace an implementation by deleting it first, then rebuilding it from a
  contract that a fresh agent receives without ever seeing the old code. Fixes
  the failure where a model asked for a complete rewrite returns a renamed
  variable. Ships an overlap gate that scores the result against the deleted
  original and rejects paraphrase. Handles a new interior behind an existing
  seam, seam extraction first, and dependency swaps. TRIGGER when: user says
  "rewrite this properly", "complete rewrite", "no cosmetic changes", "replace
  X with Y", "swap this library", "change this algorithm", or a previous
  rewrite attempt came back as a cosmetic edit. DO NOT TRIGGER for ordinary
  edits, bug fixes, or additive features.
argument-hint: "[target file, module, or dependency to replace]"
---

# Blind Rewrite

Delete the implementation. Rebuild it from a contract. Never let the author see
what it replaced.

## Why this exists

Ask a model to completely rewrite code that sits in its context and it returns a
paraphrase. It renames a variable, reorders two lines, and reports a rewrite.

Instruction strength does not fix this. A prompt that names the failure in advance
and bans cosmetic edits by name still gets cosmetic edits. Three causes drive it,
and none of them answer to wording.

1. **The original is an attractor.** Generation conditions on the text in context.
   A prohibition does not outrank that conditioning. Removal does.
2. **Bulk collapses effort.** A rewrite costs far more output than an edit. Given
   forty items in one pass, the model spreads its budget and every item gets an edit.
3. **Negative specs give nothing to aim at.** "Not a narrator" and "no longer A*"
   name what to avoid. With no positive target, the nearest concrete artifact is
   the old code, so the output stays next to it.

This workflow removes the text, splits the work into single dispatches, and states
the target in positive terms. It then measures the result against the deleted
original, because a model that failed this way once will report success again.

## What blindness covers

Blindness covers the region whose design must change. Nothing else.

- **Blind core** - the code being replaced. Deleted before the author starts.
- **Sighted shell** - callers, types, tests, configuration. Read freely. Edit normally.

The line between them is a seam. For a pathfinder the seam is the exported entry
point. For a dependency swap the seam is the module that wraps the dependency.

When no seam exists, create one first. Seam extraction changes no behavior, so run
it sighted, with the tests as proof. Blinding that step wastes a dispatch.

## Three shapes

| Shape | Blind core | Contract | Verification |
|---|---|---|---|
| **A. New interior, seam exists** | The module behind the seam | Seam plus behavior list | Differential test against the quarantined original |
| **B. No seam yet** | Nothing at first | Existing tests | Extract the seam sighted, keep tests green, then run shape A |
| **C. Dependency swap** | The adapter behind the seam | Usage census | Census coverage plus the existing test suite |

Shape A has the strongest verification available in this workflow. "Same result,
different method" means the old code is a correct oracle. Keep it, feed both
versions the same inputs, and require the same answers.

Shape C has no oracle. Census completeness carries the whole load there. Omission
replaces anchoring as the main risk, so spend the effort on the census.

## Phases

### Phase 0: Classify
Name the shape. State the seam. When the seam does not exist, run shape B now and
return here afterwards.

### Phase 1: Preflight leak sweep
Find every other copy of the target. The author holds a Read tool, so a copy on
disk defeats the blindfold.

```bash
rtk git ls-files | rtk grep -i "<target-name>"
ls dist/ build/ coverage/ 2>/dev/null
```

Delete build output, or list the paths as banned in every briefing. Record the list.

### Phase 2: Contract
Dispatch `dod-guard:blind-contract-extractor` against the target. It returns the
boundary, a `REQUIRED` and `OBSERVED` behavior split, the usage census, the leak
list, and the banned vocabulary.

Check the contract against the banned vocabulary before you use it. An interior
name that survives into the contract is an anchor, and it will come back in the
output.

### Phase 3: Human gate
Show the user the `REQUIRED` and `OBSERVED` lists. Ask which `OBSERVED` items are
requirements and which are accidents of the old code.

This is the only mandatory human step. Skipping it means the rewrite either keeps
every quirk or drops one that mattered. Neither the extractor nor the author can
settle that question, because the answer lives outside the code.

### Phase 4: Quarantine and delete
For shape A, copy the original to `.blind/quarantine/` for differential testing.
Add that path to the banned list.

```bash
mkdir -p .blind
rtk git show HEAD:<path> > .blind/original.txt
rtk git rm <path>
```

`.blind/` is scratch. Delete it in Phase 9.

### Phase 5: Blind write
Dispatch `dod-guard:blind-writer` with the contract, the conventions, and the banned
paths. One target per call. A large core takes several calls, and each call may read
what earlier calls produced. Blindness covers the original, not the new work.

For shape C, migrate the call sites after the adapter lands. Use
`dod-guard:step-by-step`, one call site per dispatch, sighted. Bulk migration in a
single dispatch reproduces cause 2 above.

### Phase 6: Verify
Run the build and the tests yourself. The author holds no shell. Return failures as
text, without quoting the old implementation.

For shape A, run the differential test against the quarantined copy. Generate inputs
across the boundary cases the contract lists. Require identical results.

### Phase 7: Overlap gate
Score the result against the deleted original.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/blind-rewrite/scripts/overlap-scan.mjs" \
  --original=.blind/original.txt \
  --rewrite=<new path> \
  --whitelist=<boundary names, comma separated> \
  --contract-file=<path>
```

Exit 0 means rewritten. Exit 1 means cosmetic. The whitelist holds boundary names,
which are required to be identical and therefore exempt from every metric.

The whitelist takes single names. A contract often requires whole passages, and
those need `--contract-file`. Write one contract string per line, or a JSON array
of strings when an entry spans several lines. Blank lines are skipped, and a line
starting with `#` is a comment. Matching happens on the token stream, so an entry
still matches when the two sides differ in whitespace or comments.

Reach for it when the target is mostly boundary. A file that registers tools, or
declares routes, or holds the server guard pattern every server in the repository
shares, reproduces long passages by obligation. Without the flag no correct answer
can pass, since the gate reads required text as copied text. Declare each required
passage, then read the result. A rewrite that passes only because the contract file
grew to cover the whole file has proved nothing. Keep each entry to text you can
point at a rule for.

| Metric | Fails when | Minimum evidence |
|---|---|---|
| `run` | The longest shared token run passes 60 tokens | none |
| `ngram` | More than 65 percent of four-token runs also occur in the original | 20 runs |
| `lines` | More than 35 percent of significant lines are unchanged | 3 matched lines |
| `order` | Declaration order survives past a similarity of 0.5 | 4 declarations |

`run` catches copied blocks. The three rates catch a kept skeleton under new names.
The limits come from measured pairs in a real repository. Unrelated files score a
run of 10 to 13. A genuine reimplementation behind the same seam scores 25. The same
file with four identifiers renamed scores 209.

A metric under its minimum evidence reports its value and never fails the gate. One
shared `return null;` in a short function is convergence, not copying.

The gate abstains below roughly 40 significant tokens. Nothing distinguishes a
rewrite from an edit at that size. Read the change yourself for targets that small.

On exit 1, redispatch the author. Tell it the result was too close to the previous
implementation. Give it nothing else. Details about how it was close are details
about the original.

### Phase 8: Gap audit
Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned contract.
It reports dropped behavior only.

Repair every gap it finds. A gap repair is a normal sighted edit, because the
design question is already settled.

### Phase 9: Cleanup
Delete `.blind/`. Confirm the quarantined copy is gone. Report the overlap numbers,
the gap audit verdict, and any `OBSERVED` behavior the user chose to drop.

## Escalation

Two failed cycles end the run. Report to the user rather than starting a third.

A second failure usually means one of three things. The contract is incomplete, so
the author cannot satisfy it. The seam is in the wrong place, so the blind core
holds work that belongs outside it. Or the original design was correct, and the
author keeps arriving at it because it fits.

The third case is a result, not a failure. Say so plainly when the evidence points
there. Learning that the old design was right costs two dispatches and settles a
question that otherwise stays open.

## Rules

1. **Delete before you dispatch.** An author that can read the original will
   reproduce it, whatever the briefing says.
2. **Describe, never copy.** The orchestrator writes the contract in its own words.
   Interior names, algorithm names, and step order stay out of it.
3. **The boundary is exact.** Signatures, error strings, and serialized keys get
   copied character for character. Everything else is the author's choice.
4. **One target per dispatch.** Batching returns the failure this skill prevents.
5. **The human prunes OBSERVED.** Never decide it yourself.
6. **Gate before you accept.** A model that paraphrased once will report success again.
7. **Difference is the goal.** Never ask why the new version does not match the old one.
