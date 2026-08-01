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

On a verdict of `mostly-essential`, stop the cycle. Record the target as
`skipped` with that reason. This is a result, not a failure. It says the
complexity in that file came from the problem, and a rewrite has nothing to
remove.

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
rtk git show HEAD:<path> > .tighten/quarantine/original.txt
rtk git rm <path>
```

Add the quarantine path to the banned list in every briefing.

## Phase 6: Blind write

Dispatch `blind-writer` with the merged contract, the complexity budget, the
conventions, and the banned paths. One target per call.

The budget goes in as a positive target. State the number of decisions the work
needs and the number of passes over the data. Do not state a method.

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
  --original=.tighten/quarantine/original.txt \
  --rewrite=<new paths> \
  --whitelist=<boundary names>

node "${CLAUDE_PLUGIN_ROOT}/../quality-guard/skills/quality-refactor/scripts/quality-scan.mjs" \
  .tighten/quarantine/original.txt --format=units > /tmp/before.json
node "${CLAUDE_PLUGIN_ROOT}/../quality-guard/skills/quality-refactor/scripts/quality-scan.mjs" \
  <new paths> --format=units > /tmp/after.json

node "${CLAUDE_PLUGIN_ROOT}/skills/tighten/scripts/simplicity-gate.mjs" \
  --before=/tmp/before.json --after=/tmp/after.json
```

| Gate | Exit 1 means | What it catches |
|---|---|---|
| overlap | cosmetic | The author paraphrased the old code |
| simplicity | not-simpler, regressed, or empty | The author traded one tangle for another |

`--after` covers every file the rewrite produced. Splitting one knot into three
clear modules is a win, and the gate totals them.

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

The recording step is not optional on any path. An attempt the ledger never
hears about is an attempt the loop repeats forever.

Report the target, the verdict, the two gate numbers, and the queue depth.

## Rules

1. **One target per invocation.** Batching returns the failure this workflow
   prevents.
2. **Clean tree in, clean tree out.** Never end an invocation mid-rewrite.
3. **Record every cycle.** Failures included.
4. **Never drop UNKNOWN behavior.** Only ACCIDENTAL, and only with evidence.
5. **Never rewrite without an oracle.** Write one first.
6. **Both gates or no accept.** Different is not enough. Smaller is not enough.
7. **Never work on master.** Commit to the working branch, and never push.
8. **Mostly-essential is a success.** Some complexity earned its place.
