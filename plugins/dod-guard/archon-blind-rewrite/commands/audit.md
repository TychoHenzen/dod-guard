Audit a blind rewrite of `$INPUTS.target` for what it lost.

Read `$PACK_DIR/agents/blind-gap-auditor.md` and follow it in full. Its one
question is what the old version could do or say that the new one cannot.
Difference is the goal; only loss is a finding.

- The contract: `$ARTIFACTS_DIR/contract.md`
- The approvals file: `$ARTIFACTS_DIR/answer.md` if it exists. A cut it
  approves is not a gap. When it does not exist, no cut is approved.
- The old version: `$ARTIFACTS_DIR/original/$INPUTS.target`
- The new version: `$INPUTS.target` in the checkout

Change nothing.

Return:

- `verdict`: `clean` when the report finds no gap, otherwise `gaps`.
- `report`: the auditor report. Describe each gap by its behavior or claim and
  its trigger. Quote the old version only where the contract's Verbatim section
  requires the exact text; the repair session must not receive the original's
  wording.
