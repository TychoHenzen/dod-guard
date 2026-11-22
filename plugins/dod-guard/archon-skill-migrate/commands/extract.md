Extract the rewrite contract for `$INPUTS.target`.

Read `$PACK_DIR/agents/blind-prose-contract-extractor.md` and follow it in
full; you are that agent for this one dispatch. The kind is in
`$ARTIFACTS_DIR/baseline.json` and the inventory in
`$ARTIFACTS_DIR/inventory.md`. The target is the whole passage.

Write your report, in the format the agent definition gives, to
`$ARTIFACTS_DIR/contract.md`. A script reads its `### Verbatim (copy exactly)`
section line by line, so write a multi-line block as one bullet per source
line.

A writer that never sees the target reads this file, and a script rejects it
if anything outside the Verbatim section repeats the target's wording.

Change nothing else and ask no one anything.
