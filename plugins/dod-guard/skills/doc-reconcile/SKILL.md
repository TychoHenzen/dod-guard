---
name: doc-reconcile
description: >-
  Find documents that contradict each other, date each conflicting claim from
  its real edit history, and delete the older side when the dating is
  decisive. Use when the user reports doc drift, conflicting docs, stale documentation, "which
  doc is right", reconcile the docs, docs contradict each other, remove
  outdated docs, or docs say different things.
---

# Doc reconcile

Read and apply `standards/working-defaults.md` from the plugin root. Stricter rules here win.

A "claim" is one scanned piece of text. A "pair" is two claims compared. Use no other names.

## Limits

- Record the initial tree state first.
- Never commit, stash, reset, or overwrite user work.
- Exclude uncommitted files from automatic dating and deletion.
- Edit only inside the files and line ranges the scanner named.
- Only delete claims and point at survivors. Never rewrite claims, edit code, or reconcile what the scanner did not report.
- Trace every deletion to one agent verdict and one dating result.

`<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile` in Claude, and the directory holding the loaded SKILL.md in Codex. Before running a script, resolve it and confirm the script exists. If neither path resolves, end the turn and report the missing path.

## 1. Scan

Run `node "<skill-dir>/scripts/scan-docs.mjs"`. It scores pairs of claims in git-tracked Markdown and plugin.json and marketplace.json descriptions, then writes the candidates file. Output is deterministic on unchanged input.

Flags (default): `--root=<path>` (cwd), `--threshold=<n>` (0.35), `--max-per-claim=<n>` (3), `--min-tokens=<n>` (6), `--out=<path>` against root (`.doc-reconcile/candidates.json`), `--json` for stdout (off), `--limit=<n>` (none). Exit 0 ran, 3 usage error.

Dispatch at most 20 times per run. Tighten `--threshold`, `--limit`, and `--max-per-claim` until the file holds at most 20 pairs, then start.

## 2. Judge

Send the agent one pair per call, with both claims' `file`, `startLine`, `endLine`, `heading`, and `text` copied from the candidates file.

In Claude Code, use the Agent tool with `dod-guard:doc-conflict-judge`. Each call is a fresh agent that ends on answering.

In Codex, use `doc-conflict-judge`. Inspect the active agent list first, reuse a related agent when practical, and limit each wave to the free slots. After a verdict, close the agent, or interrupt it if closing is unavailable. Never assume a result freed a slot. If capacity is full, release unneeded agents and retry once, else send the next pair to an existing agent as a follow-up.

The agent returns exactly one verdict: `CONFLICT` (with quoted evidence), `DUPLICATE`, `STALE-SUBSET`, or `UNRELATED`. It judges the two texts alone, since a reader never sees the other claim's surroundings. It writes nothing. You own the deletions.

Most pairs are `UNRELATED`; the scanner over-offers on purpose. Different numbers for the same thing (count, version, port, percentage, timeout) are a `CONFLICT`, unless the claims state conditions under which both hold. `STALE-SUBSET` is a narrowing, not a contradiction, so do not fix it.

## 3. Date

Date only `CONFLICT` and `DUPLICATE` pairs.

- Pair: `node "<skill-dir>/scripts/claim-age.mjs" --pair=<file>:<start>-<end> --pair=<file>:<start>-<end>`
- Single: `node "<skill-dir>/scripts/claim-age.mjs" --file=<path> --lines=<start>-<end>`
- Also `--min-gap=<days>` (1) and `--json` (off).

It follows lines through `git log -L`, skips commits that changed no words, and reports the last meaning-changing edit. Do not use git blame: rewraps make old claims look recent. The script alone decides which claim is older.

`DECISIVE` names the older claim. `AMBIGUOUS` means dates closer than `--min-gap`. A file with uncommitted changes dates as `uncommitted` and forces `AMBIGUOUS`. Exit 0 is single mode or `DECISIVE`, 1 is `AMBIGUOUS`, 3 is a usage error.

## 4. Act

| Verdict | Dating | Action |
|---|---|---|
| `CONFLICT` | `DECISIVE` | Delete the claim dated older. |
| `DUPLICATE` | `DECISIVE` | Keep the newer wording, point the older copy at it. |
| `CONFLICT` or `DUPLICATE` | `AMBIGUOUS` | Change nothing. Carry forward. |
| `STALE-SUBSET` or `UNRELATED` | not dated | Leave both alone. |

For repeated wording, delete one copy and point at the other. Never write a fresh sentence blending two claims. Leave every other claim as written. If history cannot separate the copies, keep the claim in the document that owns the subject, and say in the write-up that the choice was made, not measured.

## Report

Give one entry per deletion: the pair, the agent's quoted evidence, the commit that settled the age, and the commits skipped as wording-only. Then give one numbered list of undecided pairs, each with both claims, both dates, and what blocked a decision.
