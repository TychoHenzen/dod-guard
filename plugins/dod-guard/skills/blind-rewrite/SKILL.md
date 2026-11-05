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

Record progress in `.blind/progress.txt`, one slug per line. Append a slug with `echo <slug> >> .blind/progress.txt` only after its phase's exit condition holds. The slugs, in order, are `contract`, `quarantined`, `written`, `verified`, `gated`, `audited`. Append `audited` once the gap auditor's findings are fixed, before `.blind/` is deleted. A phase without its slug is not done. This file is the only resume state.

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

Before the first write, keep scratch out of git. Run this block once from the repository root. It appends the entry only inside a git work tree and only when `.gitignore` lacks the line, so a rerun adds nothing. It reads `.gitignore` itself instead of calling `git check-ignore`, because a global or local exclude file can hide the directory on one machine while the shared repository still lacks the entry. Never commit `.blind/`. Only the orchestrator edits `.gitignore`; the writer never does.

```bash
mkdir -p .blind
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! grep -qxF '.blind/' .gitignore 2>/dev/null; then
  [ -z "$(tail -c1 .gitignore 2>/dev/null)" ] || echo >> .gitignore
  printf '%s\n' '# blind-rewrite scratch: contract and quarantined original' '.blind/' >> .gitignore
fi
```

Save the contract at `.blind/contract.md`. It states what the target does, not how:

- behavior, inputs, outputs, and errors
- invariants and caveats
- boundary text that must survive verbatim
- every claim marked `REQUIRED` or `OBSERVED`

Keep out implementation names, declaration order, vocabulary, and any example that would hint at the old shape. Ask the user only when the contract exposes requirements that cannot both hold. Otherwise the active request authorizes progress.

### Quarantine and delete

Copy the exact original into `.blind/quarantine/`, then prove the copy is byte-identical before anything is removed. Run from the repository root, with `<target>` the path you were given and `<name>` its last path segment:

```bash
mkdir -p .blind/quarantine
cp -R "<target>" .blind/quarantine/
diff -rq "<target>" ".blind/quarantine/<name>"
```

Require exit 0 from `diff`. On exit 1, recopy once and run it again. A second exit 1 ends the run with nothing deleted. Use `diff -rq`, not `git diff --no-index`: under `core.autocrlf=true` the git command passes a CRLF copy of an LF original.

Then check whether git can restore the target with `git ls-files --error-unmatch -- "<target>"`. When it fails, the target is untracked. If `git check-ignore -q -- "<target>"` exits non-zero, snapshot the target first with a commit limited to that path, and never stash:

```bash
git add -- "<target>" && git commit -m "chore: snapshot <name> before blind rewrite" -- "<target>"
```

If `git check-ignore` exits 0, the target is ignored and cannot be committed. The verified copy is then the only backup, so keep `.blind/quarantine/` until handoff.

After the copy check passes and any snapshot is made, run `echo quarantined >> .blind/progress.txt`, then remove the target. The order is fixed: contract first, verified copy second, deletion third.

### Write blind

Dispatch a writer for the single target. Its prompt holds the contract, the seam and context it is allowed to see, and the acceptance evidence. The prompt holds no path under `.blind/quarantine/` and no text copied from the original, including in an example or an error message. The writer may read output produced earlier in this run. It must not read `.blind/quarantine/`, and it never edits `.gitignore`.

If the writer reports that it saw old text, or its tool log shows a read under `.blind/quarantine/`, delete everything it wrote at the target path and dispatch a fresh writer with the same prompt. The replacement counts as one of the two write/gate cycles. When the output is accepted, run `echo written >> .blind/progress.txt`.

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
2. Run `test ! -e .blind` and `git status --porcelain`. No `.blind/` may remain, and every `??` line must be source you meant to add. The `.gitignore` entry stays and is committed with the PBI work.
3. Write into the PBI handoff: the overlap result, the gap verdict, the changed paths, the commands run, and the exact head SHA.
4. Let the existing review and guarded merge owners take over. Do not start a second branch or PR.

## When something breaks

A failed or unclear command leaves the checkpoint in place. Preserve the checkpoint. Read back the remote state and classify the failure. If the blocker is confirmed, consult [dod-guard:codex-advisor](../codex-advisor/SKILL.md) before bringing it to the user. Do not throw away unrelated edits, repeat a review that already finished, or let a high overlap score cover for a missing claim.
