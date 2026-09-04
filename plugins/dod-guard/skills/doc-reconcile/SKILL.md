---
name: doc-reconcile
description: >-
  Find documents that contradict each other, date each conflicting claim from
  its real edit history, and delete the older side when the dating is
  decisive. Use when the user reports doc drift, conflicting docs, stale documentation, "which
  doc is right", reconcile the docs, docs contradict each other, remove
  outdated docs, or docs say different things.
---
# Doc Reconcile

Documentation rots in pairs. One file says six, another says eight, and both look
authoritative to whoever lands on them. This skill finds those pairs across the
repository, works out which half was written first from real edit history, and
deletes the older half when the history is clear enough to be sure.

Throughout, a *claim* is one scanned piece of text and a *pair* is two claims held
up against each other. No other names for those two things.

## Fixed limits

- Record the initial tree state. Exclude uncommitted files from automatic dating and
  deletion. Do not commit, stash, reset, or overwrite user work.
- One agent dispatch per pair, 20 dispatches per run at most. Tighten
  `--threshold`, `--limit` and `--max-per-claim` until the file fits that budget,
  then start dispatching.
- Keep every edit inside the files and line ranges the scanner named. Touch nothing
  else in the repository.
- Delete a claim only under the verdicts in the table below. Leave every other claim
  exactly as written.
- For repeated wording, delete one copy and point at the other. Never write a fresh
  sentence that blends the two. Instead pick one existing wording and keep it as it stands.

Scope: this skill deletes and points, and it stops there. Rewriting a claim into new
prose, editing code, and reconciling anything the scanner did not report all sit
outside it. Every deletion traces to one agent verdict and one dating result.

## Codex agent lifecycle

Before dispatching, inspect the active agent list. Reuse a related agent for later
pairs when practical. Limit each parallel wave to the free slots.

After recording a verdict, close the completed agent with the runtime's close action
when available. If only interruption is available, interrupt work that is no longer
needed. Do not assume a returned result freed a slot.

If capacity is full, release unneeded agents and retry once. If closure is unavailable,
send the next pair to an existing agent through a follow-up.

## Runtime path

Resolve `<skill-dir>` before running a bundled script. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile`. In Codex, use the directory containing this loaded
`SKILL.md`. Confirm the resolved script exists. If neither path resolves, end the turn with the
missing path.

## What each outcome buys

| Agent verdict | Dating | Action |
|---|---|---|
| `CONFLICT` | `DECISIVE` | delete the claim history dates as older |
| `DUPLICATE` | `DECISIVE` | keep the newer wording, point the older copy at it |
| `CONFLICT` or `DUPLICATE` | `AMBIGUOUS` | change nothing, carry the pair forward |
| `STALE-SUBSET` | not dated | leave both claims alone |
| `UNRELATED` | not dated | leave both claims alone |

A `STALE-SUBSET` pair says less on one side than the other. That narrowing is not a
contradiction, so it is not yours to fix.

Repeated wording that history cannot separate still deserves a single location.
Choose the document that owns the subject, keep the claim there, replace the other
copy with a pointer, and say in your write-up that you chose rather than measured.

## Getting a verdict

Send `doc-conflict-judge` exactly one pair, and give it both claims' `file`,
`startLine`, `endLine`, `heading` and `text` straight from the candidates file. It
answers with exactly one of `CONFLICT`, `DUPLICATE`, `STALE-SUBSET` or `UNRELATED`,
plus quoted evidence whenever the answer is `CONFLICT`.

Expect `UNRELATED` for most of what you send. The scanner errs toward offering too
many pairs, so a long run of `UNRELATED` means it worked as designed.

Where two claims put different numbers on the same thing, whether a count, version,
port, percentage or timeout, that is a `CONFLICT` and not a difference of phrasing.
The one exception is a pair that spells out, in the claims themselves, the
conditions under which both figures hold.

The agent weighs the two texts alone. It does not go hunting through the enclosing
document for a reading that lets both survive, because whoever reads one claim in
the wild never sees the other one's surroundings. It also writes nothing: no edits,
no merged claims, no suggested replacement wording. You own the deletions and the
dating script owns the question of which claim came first.

## Getting a date

Date the `CONFLICT` and `DUPLICATE` pairs only. Send nothing else to the script.

`claim-age.mjs` follows a line backward through `git log -L`, compares content with
formatting normalized away, passes over the commits that shifted no words, and
reports the last edit that changed what the line meant. `git blame` would name only
the newest commit touching that line, so a rewrap, autofix or reformat would dress
an old claim up as a recent one. Following the history is what keeps that from
happening.

A `DECISIVE` result names which of the two claims is older. Dates separated by less
than `--min-gap` produce `AMBIGUOUS` and no winner. A file carrying uncommitted
changes dates as `uncommitted`, which forces `AMBIGUOUS` on any pair that includes
it and exits 1.

## Script reference

```bash
node "<skill-dir>/scripts/scan-docs.mjs"
node "<skill-dir>/scripts/claim-age.mjs"
```

`scan-docs.mjs` reads every git-tracked Markdown file plus each `description` field
inside `plugin.json` and `marketplace.json`. It cuts each document into claims along
these boundaries: a paragraph, a top-level list item, a table row, a JSON
description string. It scores every pair sharing vocabulary, keeps whatever meets
the threshold, limits how many pairs one claim may join, and writes the file that
each later phase reads. Repeat runs over unchanged input match line for line, sorted
by score, then file, then line. Exit 0 ran, exit 3 flagged a usage error.

| Flag | Meaning | Default |
|---|---|---|
| `--root=<path>` | repository to read | cwd |
| `--threshold=<n>` | lowest pair score kept | 0.35 |
| `--max-per-claim=<n>` | how many pairs one claim may join | 3 |
| `--min-tokens=<n>` | drops claims holding fewer content tokens than this | 6 |
| `--out=<path>` | output file, resolved against `--root` | `.doc-reconcile/candidates.json` |
| `--json` | prints to stdout in place of writing the file | off |
| `--limit=<n>` | keeps only the best-scoring pairs | none |

`claim-age.mjs` compares two ranges given as `--pair=<file>:<start>-<end>` twice, or
ages one range given as `--file=<path>` with `--lines=<start>-<end>`. It also takes
`--min-gap=<days>`, default 1, and `--json`, default off. Exit 0 covers single mode
and a `DECISIVE` pair, exit 1 an `AMBIGUOUS` pair, exit 3 a usage error.

## What you hand back

Give every deletion its own entry: the pair, the agent's quoted evidence, the commit
that settled the age, and the commits skipped for changing wording only. Follow that
with a single numbered list of the pairs left undecided, each showing both claims,
both dates, and what stopped the dating from settling it.
