---
name: tighten
description: >-
  Autonomous loop that removes accidental complexity one target at a time. Ranks
  the repository by structural violations joined against git return-churn, then
  runs a blind rewrite of the worst target: an intent analyst separates necessary
  complexity from accidental, a blind author rebuilds from the contract, and two
  gates check that the result is both different and smaller. One target per
  invocation, so a loop driver can call it until the queue empties. TRIGGER when:
  user says "tighten the codebase", "remove accidental complexity", "run the
  tighten loop", "clean up the sprawl", or wires this skill into /loop or a cron
  job. DO NOT TRIGGER for a single named rewrite - that is /blind-rewrite - or
  for ordinary refactoring with a known target.
---

# Tighten

A loop that removes accidental complexity, one target per invocation. It ranks
files by structural violations joined with git return-churn, opens an OpenSpec
change scoped to the picked target (`openspec/changes/tighten-<slug>/`,
reusing one already open on that path), blind-rewrites the target through
subagents, and gates the result on being both different and smaller. A driver
(/loop, cron, or a human) repeats the call until the queue empties. Scope:
every file the scanner ranks is a candidate; each invocation touches one.

`.tighten/ledger.json` is a scanner queue, not a completion record: it holds
each candidate's current rank (violations x churn) and the last scan that
produced it, nothing else. A target is done when its change id archives, not
when the ledger says so - the ledger only decides what gets scanned next.
`record-result.mjs` still writes an attempt outcome for the audit trail, but
the queue drops a target on `openspec archive`, checked at Phase 1 pick time,
not on `record-result.mjs --status=accepted`.

## Runtime paths

Resolve `<skill-dir>` before running a bundled script. In Claude, use
`${CLAUDE_PLUGIN_ROOT}/skills/tighten`. In Codex, use the directory containing this loaded
`SKILL.md`. Resolve `<dod-guard-skills-dir>` as the parent of `<skill-dir>`.

Resolve `<quality-refactor-dir>` from the installed `quality-refactor` skill. Do not assume that
`quality-guard` and dod-guard occupy sibling directories. Confirm each resolved script exists. If
the dependency or a path does not resolve, end the turn and identify what is missing.

## Agent dispatch compatibility

### Codex lifecycle

Before a Codex dispatch, inspect the active agent list. Reuse a related agent when practical.

Limit each parallel wave to the free agent slots. Wait for the wave, record every result, then close completed agents with the runtime's close action when available. If only interruption is available, interrupt agents whose work is no longer needed.

Do not assume a returned result freed a slot. If capacity is full, release unneeded agents and retry once. If closure is unavailable, reuse an existing agent through a follow-up instead of spawning another.

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

## Scripts

- `quality-scan.mjs` (ships with quality-guard): emits structural-violation
  units as JSON via `--format=units`. Any scanner emitting the same units
  shape may substitute.
- `seed-ledger.mjs`: builds or re-merges the ledger from units JSON plus git
  history. A reseed refreshes scores and keeps every recorded result. In the
  ranking, formatting rules score zero, churn counts return sessions rather
  than commits (a new session after five intervening commits or two weeks),
  and returns that contain a fix commit weigh most.
- `pick-target.mjs`: prints the next target. Exit 4 means the queue is empty
  and is the driver's stop condition. Exit 3 is a usage error.
- `overlap-scan.mjs` (ships with blind-rewrite): exit 0 rewritten, exit 1
  cosmetic paraphrase, exit 3 usage error.
- `simplicity-gate.mjs`: compares two units JSON files. Exit 0 simpler, exit
  1 not simpler, regressed, or empty, exit 3 usage error. `--min-gain`
  defaults to 0, which demands strict improvement.
- `record-result.mjs`: statuses are exactly `accepted`, `pending`, and
  `resistant`. `--reason` is required for `resistant`. Every record counts as
  one attempt, and two attempts close a target permanently.

## Agents

Dispatch each with subagent_type `dod-guard:<name>`. Cap: one dispatch per
agent role per cycle, plus at most one blind-writer redispatch after a gate
failure. Never fan out parallel writers; use one author, redispatched once.

- `intent-analyst`: returns the target's goal, its minimum necessary path, an
  ESSENTIAL/ACCIDENTAL/UNKNOWN behavior split, a complexity budget, and a
  verdict of mostly-accidental, mixed, or mostly-essential. In vetting mode
  it tags proposed test cases KEEP, WEAKEN, or REJECT.
- `characterization-writer`: proposes tests that pin current observable
  behavior for a target with no suite.
- `blind-contract-extractor`: emits a REQUIRED/OBSERVED behavior contract
  from the code before deletion.
- `blind-writer`: writes the replacement from the contract alone. It has no
  shell, so the orchestrator runs every command for it.
- `blind-gap-auditor`: reports behavior the rewrite dropped.

## Phase 0: seed (once per repository, or again after major drift)

```bash
node "<quality-refactor-dir>/scripts/quality-scan.mjs" \
  src --root=. --format=units --test-path=.test. > /tmp/units.json
```
```bash
node "<skill-dir>/scripts/seed-ledger.mjs" \
  --units=/tmp/units.json --root=. --since="6 months ago"
```

## Phase 1: pick

Before anything else, check that `git status` is clean. On a dirty tree, stop
and tell the user: later phases delete files and roll back with
`git checkout -- .`, which would destroy uncommitted user work.
```bash
node "<skill-dir>/scripts/pick-target.mjs" --root=.
```
On exit 4 the queue is empty: stop. Before rewriting, open the target's
change with `openspec propose` at id `tighten-<slug>` (or resume one already
open for that path - `pick-target.mjs` skips a target whose change already
archived, so a still-open id means a retry). Create working branch
`tighten/<date>` on the first accepted target of a run. Every commit goes to
that branch and none to master, because master is Phase 12's decision, made
by the user.

## Phase 2: intent

Dispatch `intent-analyst`, record its verdict, and continue. A
`mostly-essential` verdict narrows the complexity budget but never ends the
cycle; instead every picked target proceeds to a rewrite, and Phase 8 decides.

## Phase 3: oracle

Every rewrite needs an oracle first. With an existing suite, confirm it
covers the boundary the analyst named. With none, dispatch
`characterization-writer` and send its cases to `intent-analyst` in vetting
mode. Keep only the KEEP and WEAKEN cases. Run the survivors against the
current code and confirm they pass. Commit the tests in their own commit
before the rewrite, so a rollback keeps the oracle.

## Phase 4: contract

Dispatch `blind-contract-extractor`, then merge its contract with the intent
analysis. Keep every REQUIRED item. Drop each OBSERVED item the analyst
tagged ACCIDENTAL, and note each drop for the report. Keep every other
OBSERVED item, including all UNKNOWN behavior: drop only ACCIDENTAL, only
with evidence, and a tie keeps the behavior. Screen the merged contract
against both banned-vocabulary lists in the /blind-rewrite skill: an interior
name that survives into the contract anchors the author to the original.

## Phase 5: quarantine and delete

```bash
mkdir -p .tighten/quarantine
rtk git show HEAD:<path> > .tighten/quarantine/original<ext>
rtk git rm <path>
```
Preserve the original file extension on the quarantined copy. The scanner
detects language from the extension, and a wrong extension scores zero
before-violations, so every real violation in the replacement reads as a
regression. Add the quarantine path to the banned list in every briefing.

## Phase 6: blind write

Dispatch `blind-writer` with the merged contract, the repo conventions, the
banned paths, and the complexity budget stated as a positive target (how
many decisions, how many passes over the data), never a method; state the
target rather than the technique. The briefing states how many files the
author may write and names only the output directory, never individual files
or their contents; leave that design to the author instead. It must say the deleted path
need not return: an author whose only known path is the old one recreates
it. Include this template:
```
Target directory: {dir}
Output: as many files as the budget needs. The deleted path <path> need not
return. Every file you write must meet the structural bounds on its own.
```

## Phase 7: verify

The author has no shell, so run the build, the full suite, and the oracle
yourself. Feed the quarantined original and the rewrite the same inputs on
the contract's boundary cases and require the same answers. Return failures
as plain text; describe them rather than quoting the old implementation.

## Phase 8: gates

```bash
node "<dod-guard-skills-dir>/blind-rewrite/scripts/overlap-scan.mjs" \
  --original=.tighten/quarantine/original<ext> \
  --rewrite=<new paths> \
  --whitelist=<boundary names> \
  --contract-file=<path>
```
Pass `--contract-file` when the target is mostly mandated boundary text
(tool registrations, route tables, server guard blocks): required repetition
scores as copying without it. The /blind-rewrite skill documents the format.
```bash
node "<quality-refactor-dir>/scripts/quality-scan.mjs" \
  .tighten/quarantine/original<ext> --root=.tighten/quarantine --format=units > /tmp/before.json
```
```bash
node "<quality-refactor-dir>/scripts/quality-scan.mjs" \
  <new-dir> --root=<new-dir> --format=units > /tmp/after.json
```
```bash
node "<skill-dir>/scripts/simplicity-gate.mjs" \
  --before=/tmp/before.json --after=/tmp/after.json
```
Both gates must pass: different alone or smaller alone is a reject. The
`--after` scan covers every file the rewrite produced, totaling a multi-file
split as a whole. Scan both sides with the same `--root` and rule set:
cross-file rules like `dead-export` misreport single-file scans as
regressions. Leave `--min-gain` at 0 until accepted ledger results justify
raising it.

When either gate fails, redispatch the author exactly once, saying only that
the result was too close to the previous implementation or not smaller. Any
more detail leaks the original.

## Phase 9: gap audit

Dispatch `blind-gap-auditor` with both versions and the merged contract.
Check the audit against the ACCIDENTAL-dropped list first: a gap matching
a dropped item is not a gap. Repair every other gap as a sighted edit.

## Phase 10: close

Delete `.tighten/quarantine/`. Then take exactly one of these three paths,
and record on every path: an unrecorded attempt gets picked again forever.
Never end the invocation mid-rewrite; instead exit with a clean tree at
either the old state or the accepted one. When any step cannot finish,
restore and record pending rather than stopping partway.

Accepted: commit to the branch, then record:
```bash
node "<skill-dir>/scripts/record-result.mjs" \
  --file=<path> --status=accepted --commit=<sha> --after=<tangle score>
```
This records the attempt only. The target itself is not closed yet - that
happens at Phase 12, when the user archives `tighten-<slug>` after merging.
Until archival, `pick-target.mjs` still sees the target as open and a rerun
before the merge lands should resume the same change id rather than open a
second one.
Failed, first attempt: restore and record pending. The next invocation
retries the target with fresh context.
```bash
rtk git checkout -- .
node "<skill-dir>/scripts/record-result.mjs" \
  --file=<path> --status=pending --reason="<what failed>"
```
Failed, second attempt: restore, record `resistant` with a reason, and the
target is closed. Two failures are the only valid evidence that a target did
not need a rewrite: contract incomplete, seam wrong, or the current design is
where a fresh author lands anyway. Put that reading in the `--reason` and in
the report.

## Phase 11: report

Emit this block on every invocation, whatever the verdict:
```
Target      <path>
Verdict     accepted | pending | resistant
Oracle      existing suite | characterization <file>
Overlap     <longest shared run> against <limit>
Simplicity  <before score> -> <after score>
Size        <before files>/<before lines> -> <after files>/<after lines>
Dropped     <each OBSERVED item the analyst called ACCIDENTAL, one per line>
Repaired    <each gap the auditor found in Phase 9>
Commit      <sha>, on tighten/<date>
Branch      <n> accepted targets, <m> pending, <k> resistant
Queue       <depth> targets remain
```
On pending or resistant, the one-line failure reason must be the same text
recorded in the ledger, because the next invocation reads it. Below the
block, list every accepted target on the branch: path, score moved, commit.
The report alone must let a reader judge the branch.

## Phase 12: merge (human-owned)

Whenever the branch holds an accepted commit, even when this invocation
failed, print this procedure and stop: the user runs it, never you.
Approval for one merge covers that merge alone; ask again on every run.

1. Read the whole diff:
```bash
rtk git diff master...tighten/<date> --stat
rtk git diff master...tighten/<date>
```
2. Prove the branch green from a clean build, against every CI gate, not
   only the target's suite. Run the project's clean, build, and test
   commands in sequence.
3. Merge with `--no-ff` so each rewrite stays reviewable. Squashing erases
   the per-target boundary:
```bash
rtk git checkout master
rtk git pull --ff-only
rtk git merge --no-ff tighten/<date> -m "refactor: tighten <n> targets"
```
4. Push only on explicit user instruction. When the diff bumps a
   `package.json` version, warn first: a master push publishes that package:
```bash
rtk git push origin master
```
5. Archive each merged target's change, which is what actually closes it:
```bash
rtk openspec archive tighten-<slug>
```
6. Delete the branch after landing:
```bash
rtk git branch -d tighten/<date>
```
To reject the run instead, force-delete the branch and leave the change
open rather than archiving it:
```bash
rtk git branch -D tighten/<date>
```
The queue survives either choice, because `.tighten/` is untracked and only
holds rank, not status. An archived target's change id no longer resolves
under `openspec/changes/`, so `pick-target.mjs` drops it from then on; a
rejected target keeps its change open and gets picked again, fresh context
and all. Say which happened in the report. There is nothing to hand-edit in
the ledger to requeue a target - reopening or leaving its change unarchived
is enough.
