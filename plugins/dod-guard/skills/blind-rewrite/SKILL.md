---
name: blind-rewrite
argument-hint: "<target file, module, or dependency>"
description: >-
  Replace one implementation or passage from a behavior contract rather than
  paraphrasing it. Use when a complete rewrite, replacement, library swap,
  algorithm change, or non-cosmetic document rewrite is requested, or when a
  previous rewrite was only cosmetic. Do not use for ordinary edits, bug fixes,
  additive features, or copy editing.
---

# Blind Rewrite

Read and apply `standards/working-defaults.md` and `standards/github-request-discipline.md` from the active plugin root.

Paraphrasing keeps the shape of the original. To get a real replacement, take the original away and let a writer build from a description of what it must do. This skill runs that process and then measures whether it worked.

## Ground rules

1. One target per run, in the checkout you are already in. No worktrees.
2. The work belongs to a PBI. If a parent PBI is active, work inside it. If none is, follow the `quick-pbi` feature path: create a parent issue, move it to `In Progress`, and use one branch and one PR, with no permission round.
3. You are the orchestrator. Hand discovery, contract extraction, writing, noisy test runs, and gap analysis to subagents that live briefly and have a bounded job. That is short-lived bounded collaboration. A full Codex peer thread is never the tool for routine work.
4. Call scripts from the active plugin directory. A cached, version-pinned, or copied path is wrong.
5. Do not weaken the seam, the acceptance criteria, the required checks, the review, or the guarded merge. The rewrite is done only after the PR is reviewed and its final head is verified.

## The seven phases

Go in this order: classify and preflight, Extract the contract, Quarantine and delete, Write blind, verify, Run the overlap gate, Gap audit and handoff.

### Classify and preflight

Read the target and choose the shape that fits it.

| Shape | Situation | Approach |
|---|---|---|
| A | The interior can change behind a seam | Keep public names and callers. Compare old and new results at the seam. |
| B | There is no seam | Build the smallest observable boundary and its tests first. Then treat it as A. |
| C | A dependency is being swapped | Census the call sites. Migrate one bounded site at a time. Prove the old dependency is absent. |
| D | Prose with no test harness | Preserve claims, caveats, strength, audience, and constraints. Check claim coverage. Use the prose gate. |

Locate the real seam, the tests, any generated copies, build output, bundles, and call sites. List every path that could show the old text to the writer. Those are the leak paths.

### Extract the contract

Save the contract at `.blind/contract.md`. It states what the target does, not how:

- behavior, inputs, outputs, and errors
- invariants and caveats
- boundary text that must survive verbatim
- every claim marked `REQUIRED` or `OBSERVED`

Keep out implementation names, declaration order, vocabulary, and any example that would hint at the old shape. Ask the user only when the contract exposes requirements that cannot both hold. Otherwise the active request authorizes progress.

### Quarantine and delete

Copy the exact original to `.blind/quarantine/` and check the copy. Only then remove the target. The order is fixed: contract first, deletion second.

### Write blind

Dispatch a writer for the single target. Give it the contract, the seam and context it is allowed to see, and the acceptance evidence. It may read output produced earlier in this run. It must not read `.blind/quarantine/`.

### Verify

Run the focused checks, then the full relevant suite one time.

- Shape A: compare the boundary results against the quarantine.
- Shape C: walk the census item by item.
- Shape D: confirm every required claim at its recorded strength.

If something is missing, you fix it. The writer is never shown the old text to close a gap.

### Run the overlap gate

```
node "<directory containing this SKILL.md>/scripts/overlap-scan.mjs" --original=.blind/quarantine --rewrite=<target> --mode=code|prose [--whitelist=name1,name2] [--contract-file=.blind/contract.md]
```

Exit 0 means the rewrite is sufficiently different. Exit 1 means cosmetic overlap. Before scoring, the scan strips whitelisted boundary names and any passage the contract requires verbatim.

Code mode fails the rewrite above any of these:

- a 60-token copied run
- 65% shared four-token n-grams
- 35% identical lines
- 50% token-order similarity

Prose mode fails it above any of these:

- a 15-token copied run
- 20% shared four-token n-grams
- 40% identical sentences
- 60% order similarity

With fewer than roughly 40 significant tokens the numbers say little. Report the metrics and inspect the text yourself.

After exit 1, tell the writer `too close` and nothing more. No metrics, no scores, no excerpts. The retry writer must be a fresh bounded subagent. Allow at most two write/gate cycles. A second failure ends the run with a report, not a third try.

### Gap audit and handoff

A separate bounded auditor compares the work against the contract. It may read the quarantine, the replacement, and the pruned contract. Fix every real gap the auditor finds and rerun the affected checks before you delete `.blind/` and hand off. Then close out:

1. Delete `.blind/`.
2. Write into the PBI handoff: the overlap result, the gap verdict, the changed paths, the commands run, and the exact head SHA.
3. Let the existing review and guarded merge owners take over. Do not start a second branch or PR.

## When something breaks

A failed or unclear command leaves the checkpoint in place. Preserve the checkpoint. Read back the remote state and classify the failure. If the blocker is confirmed, consult [dod-guard:codex-advisor](../codex-advisor/SKILL.md) before bringing it to the user. Do not throw away unrelated edits, repeat a review that already finished, or let a high overlap score cover for a missing claim.
