Audit the migrated draft of `$INPUTS.target` for what it lost.

Read `$PACK_DIR/agents/blind-gap-auditor.md` and follow it in full; you are
that agent for this one dispatch. Difference is the goal; only loss is a
finding.

- The old version: `$ARTIFACTS_DIR/original/$INPUTS.target`
- The new version: `$ARTIFACTS_DIR/migrated.md`
- The contract: `$ARTIFACTS_DIR/contract.md`
- The approved cuts: `$ARTIFACTS_DIR/approvals.json`. An approved cut is not
  a gap. Its `replacements` list edits exact text: a Verbatim item `text` that
  the new version replaced with its `becomes`, character for character, is not
  a gap; a `becomes` the new version lacks is.
- The maintainer's corrections: `$ARTIFACTS_DIR/corrections.md`. A
  correction that names a missed requirement makes its absence a gap.

Also do phase 5 of `$PACK_DIR/skills/skill-migrate/SKILL.md`: map each
REQUIRED claim, and each OBSERVED claim that was neither cut nor ACCIDENTAL in
`$ARTIFACTS_DIR/classification.md`, to the sentence in the new version that
carries it. An unmapped claim is a gap.

Write the report to `$ARTIFACTS_DIR/audit.md`. It must contain a line that is
exactly `### Approved cuts`, followed by every approved cut; write `- None.`
under it when there are none. A repair session that never sees the original
reads this report, so describe each gap by its behavior or claim and quote the
old version only where the contract's Verbatim section requires the exact
text.

Change nothing else and ask no one anything.

Return `verdict`: `clean` when the report finds no gap, otherwise `gaps`.
