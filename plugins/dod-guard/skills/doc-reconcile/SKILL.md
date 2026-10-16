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

Read and apply `standards/working-defaults.md` from the plugin root. Stricter boundaries in this skill win.

Documentation goes wrong in pairs: one page gives six, another gives eight, and each looks like the authority. This skill locates such pairs, asks edit history which side is older, and removes that side only when history answers plainly.

Two words are fixed here. A *claim* is one scanned piece of text. A *pair* is two claims held against each other.

## Who decides what

| Actor | Decides |
|---|---|
| Scanner (`scan-docs.mjs`) | which pairs are worth a look |
| `doc-conflict-judge` | what a pair is: its verdict |
| Dating script (`claim-age.mjs`) | which claim is older |
| This thread | whether to delete, and the deletion itself |

No actor takes over another's decision. The thread never guesses an age, and the judge never edits.

## Hard rules

- Record the initial tree state first.
- Exclude uncommitted files from automatic dating and deletion.
- Do not commit, stash, reset, or overwrite user work.
- Make no GitHub writes.
- Dispatch at most 20 agents in a run, one per pair.
- Edit only inside the files and line ranges the scanner named.
- Delete or alter a claim only as the outcome table allows. Leave every other claim as written.
- Delete and point, nothing more. Do not rewrite a claim into new prose, edit code, or reconcile anything the scanner did not report.
- Trace each deletion to exactly one verdict and one dating result.

## Outcomes

| Verdict and dating | Result |
|---|---|
| `CONFLICT` + `DECISIVE` -> delete the claim history dates as older | the older claim goes |
| `DUPLICATE` + `DECISIVE` -> keep the newer wording, point the older copy at it | the older copy becomes a pointer |
| `CONFLICT` or `DUPLICATE` + `AMBIGUOUS` -> change nothing, carry the pair forward | no edit; the pair is reported as undecided |
| `STALE-SUBSET` + not dated -> leave both claims alone | no edit |
| `UNRELATED` + not dated -> leave both claims alone | no edit |

A `STALE-SUBSET` pair is a narrowing, not a contradiction, so it is not this skill's to fix.

For repeated wording, keep one existing copy and point the other at it. Never compose a fresh sentence from both.

When history cannot split a `DUPLICATE` pair, the wording still needs one home. Keep it in the document that owns the subject and turn the other copy into a pointer. The report must say this choice was made, not measured.

## Procedure

1. Find `<skill-dir>`. In Claude it is `${CLAUDE_PLUGIN_ROOT}/skills/doc-reconcile`. In Codex it is the directory holding the loaded `SKILL.md`.
2. Check that the scripts exist there. If not, end the turn and name the missing path.
3. Record the tree state, then run the scanner.
4. Count the pairs in `.doc-reconcile/candidates.json`. If there are more than 20, raise `--threshold` or lower `--limit` and `--max-per-claim`, rerun, and recount until the count fits.
5. Send each pair to the judge.
6. Date each `CONFLICT` and `DUPLICATE` pair.
7. Apply the outcome table.
8. Write the report.

```bash
node "<skill-dir>/scripts/scan-docs.mjs"
node "<skill-dir>/scripts/claim-age.mjs"
```

## The scanner

It reads every git-tracked Markdown file and every `description` field in `plugin.json` and `marketplace.json`. It cuts each into claims at a paragraph, top-level list item, table row, or JSON description string. It scores each pair of claims that share vocabulary, drops pairs under the threshold, caps how many pairs one claim joins, and writes `.doc-reconcile/candidates.json`. On unchanged input a rerun yields the same lines, ordered by score, then file, then line.

| Flag | Effect | Default |
|---|---|---|
| `--root=<path>` | repository to read | cwd |
| `--threshold=<n>` | lowest pair score kept | 0.35 |
| `--max-per-claim=<n>` | how many pairs one claim may join | 3 |
| `--min-tokens=<n>` | drop claims with fewer content tokens | 6 |
| `--out=<path>` | output file, resolved against `--root` | `.doc-reconcile/candidates.json` |
| `--json` | print to stdout instead of writing the file | off |
| `--limit=<n>` | keep only the best-scoring pairs | none |

It exits 0 when it ran and 3 on a usage error.

It offers more pairs than are real on purpose. A long run of `UNRELATED` verdicts shows it working.

## The judge

Use the agent `dod-guard:doc-conflict-judge`, also called `doc-conflict-judge`. In Claude Code, dispatch it through the Agent tool.

- Give it one pair per call.
- For both claims, pass `file`, `startLine`, `endLine`, `heading`, and `text`, copied directly from the candidates file.
- It answers with exactly one of `CONFLICT`, `DUPLICATE`, `STALE-SUBSET`, or `UNRELATED`. A `CONFLICT` answer includes quoted evidence.
- It reads the two texts and nothing else, because someone who meets a single claim never sees what surrounds the other. It does not hunt through the enclosing document for a reading that lets both stand.
- It writes nothing: no edits, merged claims, or replacement wording.
- Two claims that give different numbers for the same thing (count, version, port, percentage, timeout) are a `CONFLICT`, not a difference in phrasing. The only exception is a pair whose own text states when each figure holds.

Agent handling by runtime:

- Claude Code: every Agent call starts a fresh agent that ends once it answers. There is nothing to close.
- Codex: list the active agents before you dispatch, and reuse a related one for later pairs where practical. Run each parallel wave only as wide as the free slots. Once a verdict is recorded, close that agent with the runtime's close action; if there is none, interrupt work you no longer need. A returned result does not mean the slot is free. When capacity is full, release agents you do not need and retry once. When closing is not possible, send the next pair as a follow-up to an agent that already exists.

## The dating script

Send it `CONFLICT` and `DUPLICATE` pairs only.

It walks a line back through `git log -L`, compares text with formatting normalized, passes over commits that changed no words, and reports the last edit that changed the meaning. It does not use `git blame`, which credits the newest commit to touch a line and so makes an old claim look recent after a rewrap, autofix, or reformat.

- `--pair=<file>:<start>-<end>`, given twice, compares two ranges.
- `--file=<path>` with `--lines=<start>-<end>` ages one range.
- `--min-gap=<days>` sets the smallest meaningful gap. Default 1.
- `--json` prints JSON. Default off.

Results and exit codes:

- `DECISIVE` names the older claim. Exit 0, as for single mode.
- `AMBIGUOUS` means the dates fall closer than `--min-gap`, so there is no winner. Exit 1.
- A file with uncommitted changes dates as `uncommitted`. Any pair that includes it is `AMBIGUOUS`.
- Exit 3 is a usage error.

## Report

For each deletion, list:

- the pair
- the judge's quoted evidence
- the commit that settled the age
- the commits passed over because they changed wording only

After the deletions, add one numbered list of undecided pairs. Give each pair's two claims, their two dates, and the reason the dating could not settle it.
