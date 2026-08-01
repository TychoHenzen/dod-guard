---
name: doc-reconcile
description: >-
  Find documents that contradict each other, date each conflicting claim from
  its real edit history, and delete the older side when the dating is
  decisive. Use for doc drift, conflicting docs, stale documentation, "which
  doc is right", reconcile the docs, docs contradict each other, remove
  outdated docs, or docs say different things.
---

# Doc Reconcile

## The problem

Facts change while the work goes on. The same fact ends up written in several
documents: a README, a package CLAUDE.md, a skill's SKILL.md, a manifest
description. Later, an agent finds the older statement first, believes it,
and acts on it. Nobody consulted the history, because a document does not
carry its own revision date on its face. This skill finds those pairs, dates
them from git, and deletes the stale side when the dating is decisive.

## The pipeline

### 1. Scan

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile/scripts/scan-docs.mjs" \
  --root=. --out=.doc-reconcile/candidates.json
```

Reads every git-tracked `.md` file plus the `description` fields in
`plugin.json` and `marketplace.json`. Splits each document into claim units:
one paragraph, one top-level list item, one table row, or one JSON
description string. Scores every pair of units that share vocabulary and
writes the survivors to `--out`, sorted by score descending, then by file and
line. Two runs over the same input always produce the same file.

On this repository the scan reads 78 documents into 5215 claim units. A full
judge pass over every candidate pair costs one dispatch per pair. Bound the
scan before dispatching. `--threshold` raises the score floor. `--limit`
caps the pair count. `--max-per-claim` caps how many pairs one claim can
appear in.

### 2. Judge each pair

Dispatch the `doc-conflict-judge` agent, one pair per dispatch, in batches.
Give it the two claims' `file`, `startLine`, `endLine`, `heading`, and `text`
fields from the candidates file. It returns one of `CONFLICT`, `DUPLICATE`,
`STALE-SUBSET`, or `UNRELATED`, with a quoted-evidence line for any
`CONFLICT`. The scanner is tuned for recall, so most pairs come back
`UNRELATED`. That is the expected shape of the output, not a failure.

### 3. Date every CONFLICT and DUPLICATE pair

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile/scripts/claim-age.mjs" \
  --pair=<file>:<start>-<end> --pair=<file>:<start>-<end> --json
```

Exit 0 means `DECISIVE` and names the older side. Exit 1 means `AMBIGUOUS`.
Exit 3 is a usage error. Only run this step on pairs the judge called
`CONFLICT` or `DUPLICATE`. `STALE-SUBSET` and `UNRELATED` pairs skip dating
entirely, because nothing about them needs an older side identified.

### 4. Resolve

- **`CONFLICT` plus exit 0**: delete the older claim. Say which commit dated
  it and which commits were skipped as cosmetic.
- **`DUPLICATE` plus exit 0**: keep the newer wording in one place, and
  replace the older copy with a pointer to it. Do not leave two copies to
  drift again.
- **`STALE-SUBSET`**: leave it. It is not a contradiction.
- **Exit 1, any verdict**: change nothing. Collect it for the report.

A `DUPLICATE` pair is often written in one commit, so both sides date
identically and `claim-age.mjs` returns `AMBIGUOUS`. The dating cannot pick a
winner there. Instead, choose the canonical home by which document owns the
subject, and report that choice in the same list as the other `AMBIGUOUS`
pairs. Never delete a claim on an `AMBIGUOUS` verdict, whatever the judge
said.

### 5. Report

List every deletion with its evidence: the pair, the judge's quote, and the
deciding commit. Then give the user one numbered list of the `AMBIGUOUS`
pairs, each with both claims, both dates, and the reason it could not be
decided. That list is the only thing the user has to read.

## Why dating is not just blame

`git blame` names only the most recent commit that touched a line. A
reformat, an autofix, or a version bump that rewrapped a paragraph makes an
old claim look new. `claim-age.mjs` walks the line's history with
`git log -L`. It compares the normalized content of each change and skips
the commits that changed no words. It dates the claim to the last edit that
changed its meaning.

Real example from this repository:
`packages/dod-guard/skills/clean-house/SKILL.md` line 92 dates to 2026-07-27
by blame, and to 2026-07-13 by this tool. The 2026-07-27 commit only changed
a trailing colon to a period.

## Worked example

`.data/micro-mutations/REPORT.md:54` says `32%` for
`packages/obsidian-rag/src/retriever.ts`. `docs/MICRO_MUTATIONS.md:53` says
`42%` for the same file on the same date. Pair mode:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile/scripts/claim-age.mjs" \
  --pair=".data/micro-mutations/REPORT.md:54-54" \
  --pair="docs/MICRO_MUTATIONS.md:53-53" --json
```

Returns `DECISIVE`, `docs/MICRO_MUTATIONS.md:53` older by 7.62 days.

## Flags

### scan-docs.mjs

| Flag | Default | Meaning |
|---|---|---|
| `--root=<path>` | cwd | Repository to scan |
| `--threshold=<n>` | 0.35 | Minimum pair score to keep |
| `--max-per-claim=<n>` | 3 | Pair cap per claim |
| `--min-tokens=<n>` | 6 | Drop claims with fewer content tokens than this |
| `--out=<path>` | `.doc-reconcile/candidates.json` | Output file, relative to root |
| `--json` | off | Print to stdout instead of writing a file |
| `--limit=<n>` | none | Keep only the top N pairs |

Exit codes: 0 ran, 3 usage error.

### claim-age.mjs

| Flag | Default | Meaning |
|---|---|---|
| `--file=<path>` `--lines=<start>-<end>` | required in single mode | Date one claim |
| `--pair=<file>:<start>-<end>` (given twice) | required in pair mode | Compare two claims |
| `--min-gap=<days>` | 1 | Minimum gap before a pair counts as decisive |
| `--json` | off | Print JSON instead of text |

Exit codes: 0 single mode or pair `DECISIVE`, 1 pair `AMBIGUOUS`, 3 usage
error.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Deleting on an `AMBIGUOUS` verdict | The dating could not tell which side is older. Deleting either one is a coin flip. |
| Trusting blame recency | Blame reports the last touch, not the last meaning change. A punctuation fix makes an old claim look freshly written. |
| Rewriting both claims into a new merged sentence | The skill deletes and points, it does not compose new prose. A merge is an edit nobody reviewed against the judge's verdict. |
| Reading around a pair until the two claims can be reconciled | The judge classifies the two claims as given. A reader who lands on one has no access to the other's context. |
| Treating a number difference as a wording difference | A differing count, version, port, percentage, or timeout is a `CONFLICT`, not a paraphrase to reconcile. |
| Running the pipeline without checking the tree is clean first | Scanning and dating read files in place. Uncommitted changes to a scanned file make `claim-age.mjs` return `uncommitted` for it. |

## Safety rules

1. Work on a clean tree.
2. Never delete a claim the judge did not call `CONFLICT` or `DUPLICATE`.
3. Never delete on exit 1.
4. Never edit a file the scanner did not report.
