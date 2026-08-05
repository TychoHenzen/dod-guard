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

## Why the prose track exists

Rewriting means throwing away the words and keeping the point. You work out what
the passage has to say. Then you write it again from scratch: new sentences, a
new order, and however many sentences the point needs.

Editing is the other thing. You keep the passage and change parts of it. A word
swapped, a clause cut, a comma fixed. The skeleton survives.

The practical test is whether you are looking at the old text while you write. If
you are, you are editing, and the old structure leaks through as the same
sentences in the same order with fresher vocabulary. Blinding removes the old
text, so the test is passed by construction.

You rewrite when the structure is the problem: the passage buries its point,
argues in the wrong order, or makes a claim it cannot support. You edit when the
structure works and the words are clumsy. Editing a broken structure is the
failure mode, because you spend an hour and get a polished version of the wrong
passage.

A caller who reached for this skill on a prose target has already decided the
structure is the problem. Phase 0 does not reopen that question for prose, the
same way it does not reopen it for code. See rule 8.

## What blindness covers

Blindness covers the region whose design must change. Nothing else.

- **Blind core** - the code being replaced. Deleted before the author starts.
- **Sighted shell** - callers, types, tests, configuration. Read freely. Edit normally.

The line between them is a seam. For a pathfinder the seam is the exported entry
point. For a dependency swap the seam is the module that wraps the dependency.
For prose the blind core is the passage being replaced. The sighted shell is the
rest of the document: the sections that cite it, the style guide, and the
glossary. The seam is the passage boundary, usually a section heading or a
paragraph range.

When no seam exists, create one first. Seam extraction changes no behavior, so run
it sighted, with the tests as proof. Blinding that step wastes a dispatch.

## Four shapes

| Shape | Blind core | Contract | Verification |
|---|---|---|---|
| **A. New interior, seam exists** | The module behind the seam | Seam plus behavior list | Differential test against the quarantined original |
| **B. No seam yet** | Nothing at first | Existing tests | Extract the seam sighted, keep tests green, then run shape A |
| **C. Dependency swap** | The adapter behind the seam | Usage census | Census coverage plus the existing test suite |
| **D. Prose, no harness** | The passage | Claim contract | Claim coverage plus the gap audit plus the prose overlap gate |

Shape A has the strongest verification available in this workflow. "Same result,
different method" means the old code is a correct oracle. Keep it, feed both
versions the same inputs, and require the same answers.

Shape C has no oracle. Census completeness carries the whole load there. Omission
replaces anchoring as the main risk, so spend the effort on the census.

Shape D has no oracle either, the way shape C has none. No test runs against a
passage of prose. The dependency census the contract extractor builds carries
the load that the usage census carries for shape C.

## The contract splits what from how

Every shape's contract draws one line: what the replacement must preserve, and
how it gets there. In code the split is boundary and interior. In prose the split
is what is said and how it is said.

What carries over: each claim with its strength, meaning always, usually,
sometimes or never. Its caveats and exceptions carry over too. So does text
required word for word: quotations, proper names, figures, defined terms and
linked headings. So do the constraints of audience, register and rough length.

What gets thrown away: the sentences, their order, their number, the vocabulary,
the metaphors and examples, and the rhetorical shape.

A right contract line names a fact, not the passage. It reads: "a model that can
see the old text reproduces it, always." A wrong line describes the passage
performing. It reads: "it opens with a question, then lists three causes." The
wrong line hands the writer the old shape, and the workflow stops working.

## Phases

### Phase 0: Classify
Name the shape. State the seam. When the seam does not exist, run shape B now and
return here afterwards.

Classifying is the only judgment this phase makes. It never decides whether the
rewrite is worth doing. A caller who asked for a blind rewrite has already made
that call, and reading the code cannot overturn it. See rule 8.

**Prose**: this phase also decides shape D. A target is shape D when it has no
test harness and no build step. The change has to be to the writing itself.

### Phase 1: Preflight leak sweep
Find every other copy of the target. The author holds a Read tool, so a copy on
disk defeats the blindfold.

```bash
rtk git ls-files | rtk grep -i "<target-name>"
ls dist/ build/ coverage/ 2>/dev/null
```

Delete build output, or list the paths as banned in every briefing. Record the list.

**Prose**: the sweep also looks for a rendered docs build and a duplicated
section elsewhere in the tree. It looks for a quoted excerpt in another file,
and for a generated summary or changelog entry.

### Phase 2: Contract
Dispatch `dod-guard:blind-contract-extractor` against the target. It returns the
boundary, a `REQUIRED` and `OBSERVED` behavior split, the usage census, the leak
list, and the banned vocabulary.

Check the contract against the banned vocabulary before you use it. An interior
name that survives into the contract is an anchor, and it will come back in the
output.

**Prose**: dispatch `dod-guard:blind-prose-contract-extractor` instead. It returns
the same shape, in claim terms: a `Verbatim` section, `Constraints`, a dependency
census, `REQUIRED` and `OBSERVED` claims with strength, a leak list, and banned
vocabulary.

### Phase 3: Human gate
Show the user the `REQUIRED` and `OBSERVED` lists. Ask which `OBSERVED` items are
requirements and which are accidents of the old code.

This is the only mandatory human step. Skipping it means the rewrite either keeps
every quirk or drops one that mattered. Neither the extractor nor the author can
settle that question, because the answer lives outside the code.

This gate is unchanged for prose. The human prunes `OBSERVED` claims the same way.

### Phase 4: Quarantine and delete
For shape A, copy the original to `.blind/quarantine/` for differential testing.
Add that path to the banned list.

```bash
mkdir -p .blind
rtk git show HEAD:<path> > .blind/original.txt
rtk git rm <path>
```

`.blind/` is scratch. Delete it in Phase 9.

**Prose**: quarantine the passage the same way, into `.blind/original.txt`, before
deleting it from the document.

### Phase 5: Blind write
Dispatch `dod-guard:blind-writer` with the contract, the conventions, and the banned
paths. One target per call. A large core takes several calls, and each call may read
what earlier calls produced. Blindness covers the original, not the new work.

For shape C, migrate the call sites after the adapter lands. Use
`dod-guard:step-by-step`, one call site per dispatch, sighted. Bulk migration in a
single dispatch reproduces cause 2 above.

**Prose**: dispatch `dod-guard:blind-prose-writer` instead, one passage per call.

### Phase 6: Verify
Run the build and the tests yourself. The author holds no shell. Return failures as
text, without quoting the old implementation.

For shape A, run the differential test against the quarantined copy. Generate inputs
across the boundary cases the contract lists. Require identical results.

**Prose**: no build runs and no test runs. Verification is claim coverage. Walk the
`REQUIRED` list and find where the new passage carries each claim, at its recorded
strength. A claim you cannot point at is a failure. Redispatch the writer with that
claim named.

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

**Prose**: run the same script with `--mode=prose`.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/blind-rewrite/scripts/overlap-scan.mjs" \
  --mode=prose \
  --original=.blind/original.txt \
  --rewrite=<new path> \
  --contract-file=<path>
```

| Metric | Fails when | Minimum evidence |
|---|---|---|
| `run` | The longest shared token run passes 15 tokens | none |
| `ngram` | More than 20 percent of four-token runs also occur in the original | 20 runs |
| `sentences` | More than 40 percent of sentences closely match an original sentence | 3 sentences |
| `order` | The matched sentences keep the original's order past a similarity of 0.6 | 4 sentences |

The limits come from measured pairs in the fixtures at
`skills/blind-rewrite/scripts/fixtures/prose/`, all scored against `base.md`. An
unrelated section of the same house style scores a run of 2 and an ngram rate of
0.000. An honest rewrite scores a run of 5 and 0.012. A light edit scores 57 and
0.921. A synonym swap that keeps the sentence order scores 24 and 0.656. A
heavier synonym swap scores 14 and 0.289. That last pair is the one `sentences`
misses and `order` catches. Its order rate is 1.000 over 11 matched sentences,
because the sentences still fall in the old order after most of their words
changed.

`run` and `ngram` do for prose what they do for code. They catch a copied block
and a kept skeleton under new words. The two sentence metrics do what neither
code metric can. `sentences` catches a kept sentence dressed in fresher words.
`order` catches a kept skeleton after the words have moved too far for the
sentences to match closely. It asks whether the surviving matches still run in
the old order.

`--whitelist` and `--contract-file` work the same in both modes. In prose the
contract file holds the required verbatim passages the extractor listed under
`Verbatim`.

On exit 1, redispatch the author. Tell it the result was too close to the previous
implementation. Give it nothing else. Details about how it was close are details
about the original.

### Phase 8: Gap audit
Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned contract.
It reports dropped behavior only.

Repair every gap it finds. A gap repair is a normal sighted edit, because the
design question is already settled.

This dispatch is unchanged for prose. The same auditor covers a dropped claim the
way it covers dropped behavior.

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

Reaching that reading needs two completed rewrites. It is what the measurements
say afterwards, never a prediction that saves you from running them.

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
8. **Always rewrite.** Never report back that the target looked fine as it was.
   The user asked for a replacement to compare against the original. Produce one,
   then let the gates and the user judge it.
9. **Reproduce claim strength exactly.** A hedge flattened to a flat claim is a
   new claim, and the document cannot support it.
