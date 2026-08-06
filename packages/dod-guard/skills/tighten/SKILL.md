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
argument-hint: "[optional: path to seed the ledger from]"
---

# Tighten

Find the code that grew by patching. Rebuild it from what it is actually for.
Prove the result is smaller. Record what happened. Exit.

## Why this exists

`/blind-rewrite` fixes one rewrite. It does not fix the reason the rewrite was
needed.

A model asked for a feature adds a path. Asked again, it adds another path
beside the first. Nothing in that loop ever removes a path, so the accidental
parts accumulate. Branches that cannot both matter. Passes that recompute what
an earlier pass already had. Options with one live value. Layers that only
forward. Each addition was reasonable. The total is not.

That accumulation has no natural opponent. This skill is the opponent. It runs
on its own, picks its own targets, and its only job is subtraction.

## The loop contract

**One invocation handles one target.** It starts from a clean tree. It ends with
a clean tree, at either the old state or the new one. Nothing is left half
rewritten.

That is what makes the loop safe to drive from `/loop`, from a cron job, or by
hand. Interrupt it at any point and the repository is in a state somebody can
work in.

```
/loop "/tighten"
```

`pick-target.mjs` exits 4 when the queue is empty. A driver that watches exit
codes stops there.

## What this borrows and what it adds

The rewrite machinery comes from `/blind-rewrite`: the same contract extractor,
the same blind author, the same gap auditor, the same overlap gate. Read that
skill for why blindness is the only reliable cure for paraphrase.

Three things are new here.

| Addition | What it replaces | Why |
|---|---|---|
| Ledger, ranked by churn times complexity | The user naming a target | The loop has to choose, and complexity alone chooses badly |
| `intent-analyst` | The mandatory human gate | Somebody has to say which observed behavior is an accident |
| `simplicity-gate.mjs` | Nothing | The overlap gate proves difference. It does not prove reduction |

## The safety asymmetry

`/blind-rewrite` makes the human prune the OBSERVED list, because neither the
extractor nor the author can settle which quirks matter. Removing a human from
the loop does not remove that question. It only moves it.

Two things answer it here, and both must hold.

1. **The intent analyst drops only what it can show nothing depends on.**
   ESSENTIAL and UNKNOWN are both kept. Only ACCIDENTAL is dropped. A tie goes
   to keeping the behavior.
2. **An oracle checks the result.** Either an existing suite or characterization
   tests written for this cycle.

A target with no oracle does not get rewritten on trust. It gets an oracle
first, from `characterization-writer`, vetted by `intent-analyst`. That vetting
is not optional. Characterization tests written against tangled code pin the
tangle as a requirement, and then the rewrite has to reproduce it.

## Phase 0: Seed the ledger

Run once per repository, and again whenever the code has moved a long way.

```bash
node "${CLAUDE_PLUGIN_ROOT}/../quality-guard/skills/quality-refactor/scripts/quality-scan.mjs" \
  src --root=. --format=units --test-path=.test. > /tmp/units.json

node "${CLAUDE_PLUGIN_ROOT}/skills/tighten/scripts/seed-ledger.mjs" \
  --units=/tmp/units.json --root=. --since="6 months ago"
```

The scanner ships with quality-guard. Any scanner works as long as it emits the
same `units` shape. When quality-guard is not installed, write that JSON by hand
or from another tool.

The ranking joins two signals. Structural violations say where the complexity
is. Git churn says where it came from. Complexity nothing ever had to patch is
usually essential, because the problem is hard. Complexity the work keeps
returning to grew by patching, and that is the kind this loop removes.
Formatting rules score zero, so a file full of long lines never reaches the
queue.

Churn counts return visits, not commits. Commits that land close together are
one piece of work, however many there are, so building a file in six commits
scores as quiet. A new session starts when five other commits land in between,
or when two weeks pass. Returns that carried a fix commit weigh heaviest.

A reseed merges. It refreshes every score and keeps every recorded result, so a
target that already resisted two cycles does not come back.

## Phase 1: Pick

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/tighten/scripts/pick-target.mjs" --root=.
```

Stop the invocation on exit 4. The queue is empty and there is nothing to do.

Check the tree is clean before anything else. On a dirty tree, stop and say so.
This loop deletes files, and it cannot tell your uncommitted work from its own.

Create the working branch on the first accepted target of a run:
`tighten/<date>`. Never work on master.

## Phase 2: Intent

Dispatch `intent-analyst` against the target. It returns the goal, the minimum
necessary path, the ESSENTIAL and ACCIDENTAL and UNKNOWN split, and a complexity
budget.

Its verdict is a prediction about how much headroom the target has. Record it
and carry on. A verdict of `mostly-essential` narrows the budget. It never ends
the cycle.

The rewrite runs on every target the ledger hands you. Nothing here decides in
advance that a rewrite is unnecessary. Reading the code cannot settle that
question. The analyst reads the very implementation it judges. A verdict that
the code is already minimal is therefore the circular conclusion this loop
exists to test. The gates in Phase 8 settle it instead, by measuring a rewrite
that exists.

## Phase 3: Oracle

The ledger says whether the target has one.

**With an existing suite:** confirm it covers the boundary the analyst named.
Continue.

**Without one:** dispatch `characterization-writer`, then send its proposed
cases back to `intent-analyst` in vetting mode. Keep only KEEP and WEAKEN cases.
Run the surviving suite against the current code and confirm it passes. Commit
the tests on their own, before the rewrite starts.

A separate commit matters. If the cycle later rolls back, the tests survive, and
the next attempt starts with an oracle it did not have.

## Phase 4: Contract

Dispatch `blind-contract-extractor`. Merge its report with the intent analysis:

- Its `REQUIRED` list stays whole.
- An `OBSERVED` item the analyst tagged ACCIDENTAL is dropped. Note it.
- Every other `OBSERVED` item is kept.

Check the merged contract against both banned vocabulary lists. An interior name
that survives into the contract is an anchor, and it comes back in the output.

## Phase 5: Quarantine and delete

```bash
mkdir -p .tighten/quarantine
rtk git show HEAD:<path> > .tighten/quarantine/original<ext>
rtk git rm <path>
```

Preserve the original file extension. A `.rs` file becomes `original.rs`, a
`.ts` file becomes `original.ts`. The quality scanner detects language from
the extension. A `.txt` extension reports zero violations because the scanner
cannot parse it, and every real violation in the replacement reads as a
regression.

Add the quarantine path to the banned list in every briefing.

## Phase 6: Blind write

Dispatch `blind-writer` with the merged contract, the complexity budget, the
conventions, and the banned paths. One target per call.

The budget goes in as a positive target. State the number of decisions the work
needs and the number of passes over the data. Do not state a method.

**Say how many files the author may write.** One target means one contract, never
one output file. A large target rebuilt inside the structural bounds needs
several files, and the deleted path does not have to come back. Say that in the
briefing every time. An author told nothing about output paths writes the old
path back, because that is the only path it was given.

Name the directory the new files go in. Never name the files, and never say what
each one should hold. That is the design, and the design is the author's.

```
Target directory: {dir}
Output: as many files as the budget needs. The deleted path <path> need not
return. Every file you write must meet the structural bounds on its own.
```

## Phase 7: Verify

Run the build and the whole suite yourself. The author holds no shell.

Run the oracle. For an existing suite that is the suite. For characterization
tests that is the file from Phase 3. Feed the quarantined original and the new
version the same inputs across the boundary cases the contract lists. Require
the same answers.

Return failures to the author as text. Never quote the old implementation.

## Phase 8: Gates

Both must pass.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/blind-rewrite/scripts/overlap-scan.mjs" \
  --original=.tighten/quarantine/original<ext> \
  --rewrite=<new paths> \
  --whitelist=<boundary names> \
  --contract-file=<path>

node "${CLAUDE_PLUGIN_ROOT}/../quality-guard/skills/quality-refactor/scripts/quality-scan.mjs" \
  .tighten/quarantine/original<ext> --root=.tighten/quarantine --format=units > /tmp/before.json
node "${CLAUDE_PLUGIN_ROOT}/../quality-guard/skills/quality-refactor/scripts/quality-scan.mjs" \
  <new-dir> --root=<new-dir> --format=units > /tmp/after.json

node "${CLAUDE_PLUGIN_ROOT}/skills/tighten/scripts/simplicity-gate.mjs" \
  --before=/tmp/before.json --after=/tmp/after.json
```

| Gate | Exit 1 means | What it catches |
|---|---|---|
| overlap | cosmetic | The author paraphrased the old code |
| simplicity | not-simpler, regressed, or empty | The author traded one tangle for another |

`--after` covers every file the rewrite produced. Splitting one knot into three
clear modules is a win, and the gate totals them.

Give the overlap gate a `--contract-file` whenever the target is mostly boundary.
A file that registers tools, or declares routes, or carries the server guard
pattern, repeats long passages because a rule says it must. The gate cannot tell
that from copying, so it reports every correct answer as cosmetic. Write the
required passages into the contract file first. Its format is in the
`/blind-rewrite` skill.

A worked case sits in the ledger. `packages/dod-guard/src/index.ts` scored
`run: 96` against a limit of 60 on a genuine rebuild. Three declared passages,
the guard block, the 12 tool descriptions and one shared schema field list,
brought it to 57 without moving a threshold.

Scan both sides with the same `--root` and the same rule set. Some rules read
across files. `dead-export` calls a symbol dead when it cannot see the caller.
A scan of one file alone then reports exports the rest of the package uses.
That reads as a regression the rewrite never caused.

The simplicity gate defaults to `--min-gain=0`, which asks only for a strict
improvement. Nothing has measured what a real gain looks like on this repository
yet. Raise the bar from the accepted results in the ledger, not from taste.

On either exit 1, redispatch the author once. Tell it the result was too close
to the previous implementation, or that it was not smaller. Give it nothing
else. Details about how it was close are details about the original.

## Phase 9: Gap audit

Dispatch `blind-gap-auditor` with both versions and the merged contract. Repair
every gap it reports. A gap repair is a normal sighted edit.

An item the analyst dropped as ACCIDENTAL is not a gap. Check the audit against
that list before you repair anything.

## Phase 10: Close the cycle

Delete `.tighten/quarantine/`. Then take exactly one of these paths.

**Accepted.** Commit to the working branch. Record it.

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/tighten/scripts/record-result.mjs" \
  --file=<path> --status=accepted --commit=<sha> --after=<tangle score>
```

**Failed, first attempt.** Restore the original, record `pending` with the
reason, and exit. The next invocation retries with a fresh context.

```bash
rtk git checkout -- .
node "${CLAUDE_PLUGIN_ROOT}/skills/tighten/scripts/record-result.mjs" \
  --file=<path> --status=pending --reason="<what failed>"
```

**Failed, second attempt.** Restore, record `resistant`, and exit. That target
is closed. Two failures mean the contract is incomplete, the seam is wrong, or
the current design is correct and the author keeps arriving at it.

That last reading is the only honest way to conclude a target did not need a
rewrite. It costs two cycles and rests on two measured attempts. Write it into
the reason when the evidence points there, and say so in the report. A target
the analyst called `mostly-essential` that then resists twice has confirmed the
prediction. One that yields a smaller version has refuted it, which is the whole
reason the prediction never gets to stop the cycle.

The recording step is not optional on any path. An attempt the ledger never
hears about is an attempt the loop repeats forever.

## Phase 11: Report

Every invocation ends with the same block, whatever the verdict.

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

On `pending` or `resistant`, say what failed in one line: which gate, or which
test, or that the author never beat the original. That line is the same text the
ledger recorded, so the next invocation reads the same reason you reported.

Then list the accepted targets on the branch, one line each: the path, the
score it moved, and the commit. That list is the whole product of the run. A
reader who sees only the report has to be able to decide whether to keep it.

## Phase 12: Merge

Print this section whenever the branch holds at least one accepted commit, even
when this invocation itself failed. Print the commands. Do not run them.

The branch is the unit the user accepts or throws away, not a single target. A
run that accepted four targets and then went resistant on a fifth still has four
good commits to land.

Say plainly that the merge is theirs to make, and wait. Approval for one merge
is not approval for the next run.

**1. Read the whole diff.**

```bash
rtk git diff master...tighten/<date> --stat
rtk git diff master...tighten/<date>
```

**2. Prove the branch green from a clean build.** Every gate the repository runs
in CI, not only the tests this loop already ran. A rewrite that passes the
target's own suite can still break a lint rule, a coverage ratchet, or another
package that imports it.

```bash
rtk npm run clean && rtk npm run build && rtk npm test
```

**3. Merge with history.** A merge commit keeps each rewrite reviewable on its
own. Squashing them into one commit throws away the per-target boundary the loop
worked to keep.

```bash
rtk git checkout master
rtk git pull --ff-only
rtk git merge --no-ff tighten/<date> -m "refactor: tighten <n> targets"
```

**4. Push only when the user says to.** In this repository a push to master
publishes every package whose version npm does not already have. Check the diff
for a `package.json` version bump before pushing, and say what will publish.

```bash
rtk git push origin master
```

**5. Delete the branch after the merge lands.**

```bash
rtk git branch -d tighten/<date>
```

Rejecting the run is one command, and it is worth stating next to the rest:

```bash
rtk git branch -D tighten/<date>
```

The ledger keeps its records either way. `.tighten/` is untracked, so deleting
the branch deletes the rewrites and leaves every record standing. A target
accepted on a branch the user then threw away stays accepted, so the loop never
picks it again and the work is gone. Say that in the report.
It is the one part of a rejection that does not undo itself.

To put such a target back in the queue, set its entry in `.tighten/ledger.json`
to `"status": "pending"` with `"attempts": 0`. Recording it again through
`record-result.mjs` does not work, because every record counts as an attempt and
two attempts close a target for good.

## Rules

1. **One target per invocation.** Batching returns the failure this workflow
   prevents.
2. **Clean tree in, clean tree out.** Never end an invocation mid-rewrite.
3. **Record every cycle.** Failures included.
4. **Never drop UNKNOWN behavior.** Only ACCIDENTAL, and only with evidence.
5. **Never rewrite without an oracle.** Write one first.
6. **Both gates or no accept.** Different is not enough. Smaller is not enough.
7. **Never work on master.** Commit to the working branch. The merge back is
   Phase 12, and the user runs it.
8. **Never skip a target.** Every picked target gets a rewrite. A prediction
   that the code is already minimal is a note in the ledger, never an exit.
9. **Only a measured cycle may clear a target.** "This did not need a rewrite"
   is a conclusion from two failed attempts, never a plan.
10. **Report every invocation.** Same block, accepted or not.
11. **Propose the merge, never run it.** Print the commands and stop. The user
    decides whether the branch lands, every time.
