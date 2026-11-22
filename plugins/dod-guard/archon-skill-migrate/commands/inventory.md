Write the inventory for migrating `$INPUTS.target` to post-4.6 Claude models.

Read `$PACK_DIR/skills/skill-migrate/SKILL.md` and follow phase 0 from "It
prints the kind" onward. The kind is in `$ARTIFACTS_DIR/baseline.json`, and the
baseline scores are in `$ARTIFACTS_DIR/baseline.txt`. The scripts already ran,
and this workflow keeps its scratch in `$ARTIFACTS_DIR`, so there is no
`.skill-migrate/` folder and no `.gitignore` entry to make.

Read the target, then trace it by kind as phase 0 says. Write
`$ARTIFACTS_DIR/inventory.md`: the one-sentence goal, the trace, the dispatches
with their return shapes, the script exit codes, and the rules.

A writer that never sees the target reads this file, and a script rejects it
if it repeats the target's wording. Describe everything in your own words,
and quote only exact text: commands, paths, flags and code.

Change nothing else and ask no one anything.
