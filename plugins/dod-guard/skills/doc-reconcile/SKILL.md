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
- Never delete from `packages/*/dist/bundle.js` or `.codex/agents/*.toml`. The scanner reads only tracked Markdown and plugin manifests, so it cannot list them today and this rule guards against a scanner change. A stale claim in generated output is fixed in the generator's source by a separate change.
- A pair with a claim in a file that a declared generator reads is undecided: delete nothing for it, because the generated copy would drift. In this repository `plugins/dod-guard/agents/*.md` feeds `.codex/agents/*.toml`, as the root `AGENTS.md` lists.

`<skill-dir>` is `${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile` in Claude, and the directory holding the loaded SKILL.md in Codex. Before running a script, resolve it and confirm the script exists. If neither path resolves, end the turn and report the missing path.

## 1. Scan

Run `node "<skill-dir>/scripts/scan-docs.mjs"`. It scores pairs of claims in git-tracked Markdown and plugin.json and marketplace.json descriptions, then writes the candidates file. Output is deterministic on unchanged input.

Flags (default): `--root=<path>` (cwd), `--threshold=<n>` (0.35), `--max-per-claim=<n>` (3), `--min-tokens=<n>` (6), `--out=<path>` against root (`.doc-reconcile/candidates.json`), `--json` for stdout (off), `--limit=<n>` (none). Exit 0 ran, 3 usage error.

Dispatch at most 20 times per run, and a re-dispatch counts toward that cap. A pair left without a dispatch is undecided with reason `out of budget`. Read `pairCount` in the candidates file. If it is above 20, rerun the scan with `--threshold` raised by 0.05 over the previous run (0.40, 0.45, 0.50, 0.55, 0.60) and stop at the first run with at most 20 pairs. If `--threshold=0.60` still gives more than 20, rerun once with `--threshold=0.60 --limit=20`; the scanner sorts by score before it cuts, so that keeps the 20 best. Judge pairs only from the file the last scan wrote, and check that its `options` match that run's flags. Never judge a pair from a file that was not regenerated. Name the final `--threshold` and `--limit` in the report.

## 2. Judge

Judge and date every pair (sections 2 and 3) before the first edit in section 4. A file with an uncommitted edit makes `claim-age` report `uncommitted`, which forces AMBIGUOUS, so editing early would leave every later pair in that file undecided.

Send the agent one pair per call, with both claims' `file`, `startLine`, `endLine`, `heading`, and `text` copied from the candidates file.

In Claude Code, use the Agent tool with `dod-guard:doc-conflict-judge`. Each call is a fresh agent that ends on answering.

In Codex, use `doc-conflict-judge`. Inspect the active agent list first, reuse a related agent when practical, and limit each wave to the free slots. After a verdict, close the agent, or interrupt it if closing is unavailable. Never assume a result freed a slot. If capacity is full, release unneeded agents and retry once, else send the next pair to an existing agent as a follow-up.

The agent returns exactly one verdict: `CONFLICT` (with quoted evidence), `DUPLICATE`, `STALE-SUBSET`, or `UNRELATED`. It judges the two texts alone, since a reader never sees the other claim's surroundings. It writes nothing. You own the deletions.

Check each reply before using it. It is malformed when it is not exactly the `VERDICT`, `EVIDENCE`, and `WHY` lines; when the verdict is not one of the four; when a `CONFLICT` has evidence `none` or lacks a quoted span from each claim; or when a quoted span appears in neither claim's `text`, ignoring whitespace. Re-dispatch the same pair once to a fresh agent. If the second reply is also malformed, record the pair as undecided with reason `malformed verdict` and delete nothing for it.

Most pairs are `UNRELATED`; the scanner over-offers on purpose. Different numbers for the same thing (count, version, port, percentage, timeout) are a `CONFLICT`, unless the claims state conditions under which both hold. `STALE-SUBSET` is a narrowing, not a contradiction, so do not fix it.

## 3. Date

Date only `CONFLICT` and `DUPLICATE` pairs.

- Pair: `node "<skill-dir>/scripts/claim-age.mjs" --pair=<file>:<start>-<end> --pair=<file>:<start>-<end>`
- Single: `node "<skill-dir>/scripts/claim-age.mjs" --file=<path> --lines=<start>-<end>`
- Also `--min-gap=<days>` (1) and `--json` (off).

It follows lines through `git log -L`, skips commits that changed no words, and reports the last meaning-changing edit. Do not use git blame: rewraps make old claims look recent. The script alone decides which claim is older.

`DECISIVE` names the older claim. `AMBIGUOUS` means dates closer than `--min-gap`. A file with uncommitted changes dates as `uncommitted` and forces `AMBIGUOUS`. Exit 0 is single mode or `DECISIVE`, 1 is `AMBIGUOUS`, 3 is a usage error.

## 4. Act

Start only after every pair is judged and dated. Group the actions by file and work one file at a time, from the highest `startLine` to the lowest, so an edit never shifts a range still to come. Before each edit, reread the range from disk. For Markdown, lines `startLine` to `endLine` joined with LF, ignoring CR, must equal the candidate's `text`. For a plugin or marketplace manifest, the `description` string parsed from the line at `startLine` must equal `text`. If the check fails, including when an earlier pair in this run already removed that claim, skip the pair and list it as undecided with reason `range changed`.

| Verdict | Dating | Action |
|---|---|---|
| `CONFLICT` | `DECISIVE` | Delete the claim dated older. |
| `DUPLICATE` | `DECISIVE` | Keep the newer wording, point the older copy at it. |
| `CONFLICT` or `DUPLICATE` | `AMBIGUOUS` | Change nothing. Carry forward. |
| `STALE-SUBSET` or `UNRELATED` | not dated | Leave both alone. |

For repeated wording, delete one copy and point at the other. Never write a fresh sentence blending two claims. Leave every other claim as written. If history cannot separate the copies, keep the claim in the document that owns the subject, and say in the write-up that the choice was made, not measured.

After the last edit to a `plugin.json` or `marketplace.json`, validate it. When `<root>/scripts/ci/validate-plugins.mjs` exists, run `node scripts/ci/validate-plugins.mjs` from `<root>`; otherwise parse the file as JSON. On failure run `git checkout -- <file>`, which drops every edit this run made to that file, and list each pair deleted from it as undecided with reason `manifest validation failed`.

## Report

Give one entry per deletion: the pair, the agent's quoted evidence, the commit that settled the age, and the commits skipped as wording-only. Then give one numbered list of undecided pairs, each with both claims, both dates, and its reason: `ambiguous dating`, `malformed verdict`, `range changed`, `manifest validation failed`, `generated source`, or `out of budget`.
