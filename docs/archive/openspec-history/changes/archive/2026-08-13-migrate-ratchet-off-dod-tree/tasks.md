## 1. Rewrite ratchet/SKILL.md

- [x] 1.1 Rewrite Setup (section 2) to generate `steps.json` via
      `dod-guard steps <change-id>` when absent, and to read prior state
      from `.step-session/steps.json` plus `progress.log` instead of
      `dod_tree`/`dod_status`/`dod_list`.
- [x] 1.2 Rewrite the iteration prompt (section 4) so each sub-problem is
      one `steps.json` step, its scoped check is that step's own
      `verify_cmd` run as a plain shell command, and the "concretize a
      draft leaf" step is removed.
- [x] 1.3 Replace the whole-document regression check with
      `dod-guard cover <change-id>`, run after every sub-problem, stopping
      before the next sub-problem on any regression.
- [x] 1.4 Drop the STUCK/`dod_amend` escalation path from section 5; the
      existing 3-repair-attempt cap becomes the sole escalation trigger,
      logged in `progress.log`.
- [x] 1.5 Rewrite Finish (section 6) to add new regression proofs by
      appending a Requirement/Scenario to the change's spec delta and a
      `tasks.md` item, then re-running `dod-guard steps <change-id>`, and
      to close with `dod-guard trace <change-id>` then
      `openspec archive <change-id> --yes` on exit 0, matching
      `/step-by-step`'s closing gate.

## 2. Fix the dependent example commands

- [x] 2.1 Replace the `dod-guard check --dod-id=<id> --node-path=0.children.1
      --quiet` example in `cheap-step/SKILL.md` (line 118) with a plain
      per-step `verify_cmd` example.
- [x] 2.2 Replace the same dead example in `evomcp/skills/cascade/SKILL.md`
      (lines 74-76, 289).
- [x] 2.3 Replace the same dead example in
      `evomcp/agents/spec-writer.md`.

## 3. Verify

- [x] 3.1 Add a regression test in
      `packages/dod-guard/src/openspec/ratchet-migration.test.ts` that reads
      the four files and asserts none contains `dod_tree`, `dod_refine`,
      `dod_status`, `dod_list`, `dod_add_node`, `dod_amend`, or
      `dod-guard check`. Carry the `// covers:` marker for this scenario
      directly above that test.
      <!-- covers: dod-guard/change-scoped-skills :: no skill or agent references the removed DoD-tree tools :: A grep for the removed tools finds nothing -->
- [x] 3.2 Run `node scripts/ci/check-skill-hygiene.mjs` and confirm it
      still passes.
