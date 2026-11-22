Port shared fixes to the surviving side before the clean-house deletion.

`$ARTIFACTS_DIR/approved.json` holds the approved items under `approved`. For
each item with `ports`, port each listed fix from its `delete` files into its
`keep` files, one at a time, as "Stage 2: dating" of
`$PACK_DIR/skills/clean-house/SKILL.md` describes: port, run the newer side's
tests, then the next. When you move a test, break the covered behavior to
confirm the moved test fails, then restore it.

- Port only the listed fixes.
- Do not delete, rename or edit any file in an item's `delete` list. They go
  in the deletion commit as they are.
- Do not commit.
- If a listed fix does not apply to the newer side, skip it and say why in
  your final reply.

A script then reverts any deletion and any edit to a dying file, runs the full
checks, and commits the ports on their own.
