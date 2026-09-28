---
name: blind-rewrite
description: >-
  Replace one implementation or passage from a behavior contract rather than
  paraphrasing the old text. Use when a complete rewrite, replacement, library
  swap, algorithm change, or non-cosmetic document rewrite is requested, or a
  previous rewrite was only cosmetic. Do not use for ordinary edits, bug fixes,
  additive features, or copy editing.
argument-hint: "<target file, module, or dependency>"
---

# Blind Rewrite

Read and apply `standards/working-defaults.md` and
`standards/github-request-discipline.md` from the active plugin root.

Delete the target only after a fresh contract records what it must do. Give the
contract to a bounded writer that cannot read the quarantined original, then
verify behavior and reject copied structure with the overlap gate. The point is
to replace the design, not rename it.

## Current delivery contract

- Run one target at a time in the current checkout. Never create or use a
  worktree.
- Run this inside the active parent PBI when one exists. For a direct rewrite
  request without a PBI, use the `quick-pbi` feature path: create one parent,
  move it to `In Progress`, and continue on one branch and one PR without a
  ceremonial permission round.
- Keep the main thread as orchestrator. Put discovery, contract extraction,
  writing, noisy tests, and gap analysis in short-lived bounded collaboration
  subagents. Never launch a full Codex peer thread for routine work.
- Use the active plugin directory containing this file for `scripts/`; never
  use a cached, version-pinned, or copied skill path.
- Preserve the existing seam, acceptance criteria, required checks, review,
  and guarded merge gates. The rewrite is not complete until the parent PR is
  reviewed and its final head is verified.

## Shapes

Classify the target before changing it:

- **A — New interior behind a seam.** Keep public names and callers; replace
  only the interior and compare both implementations at the seam.
- **B — No seam.** Establish the smallest observable boundary and tests first,
  then apply shape A.
- **C — Dependency swap.** Census every call site, migrate one bounded site at
  a time, and prove the old dependency is absent.
- **D — Prose without a harness.** Preserve claims, caveats, strength, audience,
  and constraints; verify claim coverage and run the prose overlap gate.

## Phases

1. **Classify and preflight.** Read the target, choose A–D, identify the real
   seam, tests, generated copies, build output, bundles, and call sites. Record
   every path that must not leak to the writer.
2. **Extract the contract.** A bounded subagent writes `.blind/contract.md`
   containing behavior, inputs, outputs, errors, invariants, caveats, required
   verbatim boundary text, and `REQUIRED` versus `OBSERVED` claims. Omit
   implementation names, declaration order, vocabulary, and examples that
   would reveal the old shape. Ask the user only if the contract exposes an
   incompatible requirement; otherwise the active request authorizes progress.
3. **Quarantine and delete.** Copy the exact original to
   `.blind/quarantine/`, verify the copy, then remove the target from its
   working location. Keep the quarantine unreadable to the writer.
4. **Write blind.** Dispatch a fresh bounded subagent with only the contract,
   allowed seam/context, and acceptance evidence. One target per dispatch. It
   may read earlier output from this run but never the quarantine.
5. **Verify.** Run focused checks, then the complete relevant suite once. For
   shape A compare boundary results against the quarantined implementation; for
   shape C walk the call-site census; for shape D audit every required claim at
   its recorded strength. Fix gaps in the orchestrator, not by showing the old
   implementation to the writer.
6. **Run the overlap gate.** Use the script beside this skill:

   ```text
   node "<directory containing this SKILL.md>/scripts/overlap-scan.mjs" \
     --original=.blind/quarantine --rewrite=<target> \
     --mode=code|prose [--whitelist=name1,name2] \
     [--contract-file=.blind/contract.md]
   ```

   Exit `0` means the replacement is sufficiently different; exit `1` means
   cosmetic overlap. Give a retrying writer only `too close`, never metric
   names, scores, or matching excerpts.
7. **Gap audit and handoff.** A separate bounded auditor may read the
   quarantine, replacement, and pruned contract and report dropped behavior.
   Fix every real gap, rerun affected checks, delete `.blind/`, and record the
   overlap result, gap verdict, changed paths, commands, and exact head SHA in
   the PBI handoff. Then continue through the existing review and guarded merge
   owners; do not create a second branch or PR.

## Gate limits

The code gate rejects a copied run of 60 tokens, 65% four-token n-grams, 35%
identical lines, or 50% token-order similarity when the relevant sample has
enough evidence. The prose gate uses 15-token runs, 20% four-token n-grams,
40% identical sentences, and 60% order similarity. Below roughly 40
significant tokens, report the metrics and inspect the change manually instead
of pretending statistics are proof. Whitelisted boundary names and explicit
contract verbatim passages are removed before scoring.

## Recovery

Allow at most two write/gate cycles. Preserve the checkpoint on a failed or
ambiguous command, read back remote state, classify the failure, and use
`[$dod-guard:codex-advisor](../codex-advisor/SKILL.md)` before asking the user
about a confirmed blocker. Never discard unrelated edits, rerun a completed
review, or hide a missing claim behind an overlap score.
