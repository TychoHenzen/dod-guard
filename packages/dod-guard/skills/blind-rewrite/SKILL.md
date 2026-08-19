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

Delete the target. Extract a contract that records what it does, not how it reads. Hand that contract to an author who never sees the original. Gate the result against the deleted copy with `overlap-scan.mjs`.

The author never sees the old text. The original is deleted before the author receives anything. This is the core guarantee. Every phase exists to protect it.

## Runtime path

Resolve `<skill-dir>` before running a bundled script. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/skills/blind-rewrite`. In Codex, use the directory containing this loaded
`SKILL.md`. Confirm the resolved script exists. If neither path resolves, end the turn with the
missing path.

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

## Four shapes

Classify the target into exactly one shape before any other work. Classification picks the verification strategy and the phase variants. Accept the caller's decision that the rewrite is worth doing.

**Scope:** all phases apply to a single target. Cap: 4 subagent dispatches per phase, 12 per run.

### A. New interior, seam exists

The target sits behind a public boundary (function signature, API, CLI interface). Delete and rebuild only the interior. The boundary stays. Verify by differential testing: run the same cases against the quarantined original and the new code across the boundary.

### B. No seam yet

Create the seam first. This step is sighted and includes tests for the boundary. Once the seam exists, proceed as shape A.

### C. Dependency swap

Replace a dependency across every call site. The old dependency is gone, so no oracle exists. Every call site must be migrated for the swap to count as complete. Dispatch `dod-guard:step-by-step` with one site per dispatch. All migration steps are sighted. A bulk migration in one dispatch spreads effort across too many sites.

### D. Prose, no harness

The target has no test harness and no build step. Verify through claim coverage, gap audit, and the prose overlap gate (`--mode=prose`).

## The contract

The contract splits what from how. For shapes A, B, and C, every claim is
written in OpenSpec's own shape, whether or not this repo runs OpenSpec.
That shape starts with a `### Requirement: <name>` line stating the
behavior with an RFC 2119 keyword: MUST, SHOULD, or MAY. It continues with
one or more `#### Scenario: <name>` blocks, each a GIVEN, WHEN, THEN (and
AND) bullet list. It is precise enough for the author to reproduce
exactly, and needs no reformatting later if it becomes a spec delta.

Shape D (prose) keeps its own form instead. OpenSpec's Requirement and
Scenario shape describes system behavior, not narrative claims, so it does
not fit a rewritten paragraph. A prose claim carries a strength word
instead (always, usually, sometimes, never), plus its caveats and
exceptions.

**What** (recorded): for code, Requirement and Scenario blocks in the shape
above. For prose, claims with a strength word, caveats, and exceptions.
Both also carry Verbatim text (text the replacement must copy exactly) and
constraints. Each item carries a tag: `REQUIRED` or `OBSERVED`. The
extractor tags both. The human prunes the `OBSERVED` list.

**How** (discarded): sentences, order, word count, vocabulary, metaphors, examples, rhetorical shape. The extractor omits all of these. A contract line names a fact, not the passage. Keep interior names, algorithm names, and step order out of every contract line. A line that describes structure hands the author the old shape.

Claim strength is exact either way: the RFC 2119 keyword for code, the strength word for prose. The author reproduces it exactly. A hedged claim flattened to flat is wrong, in either form. A flat claim hedged is also wrong.

### OpenSpec integration (optional, shapes A, B, C only)

OpenSpec specs describe system behavior, so only code contracts persist
through it. Shape D has no equivalent there. Skip this whole section for
prose.

Blind-rewrite works the same with or without OpenSpec, because a code
contract is always written in OpenSpec's shape (see above). No `openspec/`
folder in this repo: the contract stays inside `.blind/` and nothing below
applies.

An `openspec/` folder exists:

**Read, in Phase 0 and Phase 2.** Check whether the target's capability has
a spec or an active change: `openspec list --specs --json` and `openspec
list --changes --json`. A match means `openspec show <name> --json
--requirements` returns Requirement and Scenario blocks. Feed those to the
contract extractor as known `REQUIRED` claims in Phase 2. Their text then
comes from the spec verbatim, not from the extractor's own read of the
deleted code. `OBSERVED` claims still come from the extractor either way.

**Write, in Phase 9.** Compare the gap-audited contract against what
`openspec show` returned in Phase 0. A `REQUIRED` claim the spec did not
already carry is existing behavior, newly put into words by this rewrite,
not new behavior. Record it as a delta:
- **An active change already covers the capability**: append the claim
  under `openspec/changes/<change-id>/specs/<capability>/spec.md`, in an
  `## ADDED Requirements` or `## MODIFIED Requirements` section, matching
  whichever the claim is.
- **No active change, and the capability has no spec yet**: create one
  with `openspec new change --description "Document <capability> contract
  from blind-rewrite"`, then write the same delta under that change's
  `specs/<capability>/spec.md`.
- **The spec already carries every `REQUIRED` claim**: write nothing.

Never edit `openspec/specs/` directly. A delta lives under
`openspec/changes/<id>/` until a human runs `/opsx:archive`.

## Phases

Ten phases, numbered 0 through 9. Each phase below states its full task.

### Phase 0: Classify

Read the target. Classify into one of four shapes (A, B, C, D). Record which shape and why. The caller already decided the rewrite is worthwhile. If this repo has `openspec/`, note whether a spec or active change covers the target's capability, for Phase 2.

### Phase 1: Seal leaks

Find every copy of the target the author could reach: build output, rendered docs, duplicated sections, quoted excerpts, generated summaries. Record each as a banned path. Include these permanent banned paths:
- `~/.claude/plugins/cache/dod-guard/`
- `~/.claude/plugins/marketplaces/dod-guard/`

### Phase 2: Extract contract

Invoke `/spec-extract` with the target path. Write the output to `.blind/contract.spec.md`. The skill produces an OpenSpec-format spec with requirements, scenarios, and three appendix sections: usage census, leak list, and banned vocabulary.

After `/spec-extract` finishes, strip the banned-vocabulary and leak-list appendix sections from the file before any contract line reaches the author. Read the banned-vocabulary list first and screen every remaining contract line against it. A line that contains a banned name gets rewritten to describe the behavior without naming the interior. The stripped appendices are orchestrator input, never author input.

### Phase 3: Human review

Present the contract to the user. The user prunes the `OBSERVED` list. This is the only mandatory human step. The orchestrator must restate the agent findings in its own message, because the user cannot see subagent output directly.

### Phase 4: Quarantine

Save the original to `.blind/quarantine/original.<ext>`. Then delete it from its working location. The `.blind/` directory holds all quarantine state for this run.

### Phase 5: Author

Dispatch `dod-guard:blind-writer` for code, or `dod-guard:blind-prose-writer` for prose. One target per call. A large core may need several calls. Each call can read earlier output from the same run. Only deleted code is hidden.

### Phase 6: Verify

The author holds no shell. Build and test yourself. Feed failures back as text. Describe failures in terms of the contract, not by quoting the quarantined implementation.

- **Shape A**: Exercise boundary cases from the contract against both the quarantined copy and the replacement. Both must produce identical output.
- **Shape C**: Walk the usage census. Every call site must be migrated.
- **Shape D**: Check each `REQUIRED` claim at its recorded strength. Redispatch for gaps.

### Phase 7: Overlap gate

Run the overlap gate (see thresholds and flags below) with `--original` at `.blind/quarantine/` and `--rewrite` at the new file. Exit 1: redispatch the author with only "too close." Give the author no metric names, scores, or hint of how the texts match. Any detail anchors the next attempt toward the old text.

Two failed cycles (write, gate, rewrite) end the run. Stop after the second failure. When two completed rewrites converge on the same design, the original design was the correct one. This is a result. It requires two completed rewrites. Predict it from one and you cut the evidence in half.

## The overlap gate

```
node "<skill-dir>/scripts/overlap-scan.mjs" \
  --original=<paths> --rewrite=<paths> \
  [--mode=code|prose (default: code)] [--whitelist=a,b,c] [--contract-file=<path>]
```

Exit 0 means rewritten. Exit 1 means cosmetic.

### Code thresholds

| Metric | Limit | Min evidence |
|--------|-------|-------------|
| run | 60 tokens | none |
| ngram | 65% of 4-token runs | 20 |
| lines | 35% | 3 |
| order | 0.5 | 4 declarations |

### Prose thresholds

| Metric | Limit | Min evidence |
|--------|-------|-------------|
| run | 15 tokens | none |
| ngram | 20% | 20 |
| sentences | 40% | 3 |
| order | 0.6 | 4 sentences |

Prose `sentences` catches synonym rewrites. `order` catches sequences where words changed too much for `sentences` to match but the sequence stayed the same. Together they cover light editing through heavy synonym replacement.

A metric whose sample falls under its minimum evidence reports its value but never fails the gate. The gate abstains entirely below roughly 40 significant tokens. Read the change yourself for targets that small.

The `run` metric catches copied blocks. Rate metrics (ngram, lines/sentences, order) catch a kept skeleton under new names. A rewrite that passes only because `--contract-file` grew to cover the whole file has proved nothing.

### Whitelist and contract file

`--whitelist` holds boundary names exempt from every metric. `--contract-file` holds Verbatim passages, one per line or JSON array. Blank lines are skipped. Lines starting with `#` are comments. Matching runs on the token stream. Both flags strip matching content before metrics run.

### Calibration

Code: unrelated pairs score run 10-13, a real rewrite scores 25, a renamed copy scores 209. Prose: unrelated run 2 ngram 0.000, real rewrite run 5 ngram 0.012. Edit run 57 ngram 0.921. Synonym run 24 ngram 0.656. Heavy synonym run 14 ngram 0.289 order 1.000 over 11 matched sentences.

## Phases (continued)

### Phase 8: Gap audit

Dispatch `dod-guard:blind-gap-auditor` with both versions and the pruned contract. The auditor reports dropped behavior only. Difference is the goal, not a defect. Fix every gap. Gap fixes are sighted edits.

### Phase 9: Cleanup

When this repo has `openspec/` and the target was shape A, B, or C, write
the OpenSpec delta first (see OpenSpec integration above), before deleting
anything. Then delete `.blind/` and confirm the quarantined copy is gone.
Summarize: overlap gate scores, gap audit verdict, and which `OBSERVED`
items the user dropped. When OpenSpec is in use, also name which
`REQUIRED` claims came from an existing spec. Name which ones were newly
written as a delta, too.

## Escalation

A second overlap failure usually means one of three things: the contract is incomplete, the seam is wrong, or the original design is correct.

Blindness removes the attractor. One target per dispatch concentrates effort. The contract gives the author a positive target.
