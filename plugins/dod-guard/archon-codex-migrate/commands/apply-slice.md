Apply one approved codex-migrate slice. It is in `$ARTIFACTS_DIR/current.json`:
its `kind`, the `files` it may change, the `from` and `to` files of a move, the
`signals` a reword removes, and the `plan`. The full proposal is in
`$ARTIFACTS_DIR/proposal.md`.

Read `$PACK_DIR/skills/codex-migrate/SKILL.md` and follow "Applying", "Never",
and "Verification" item 4 for this slice only. The maintainer already approved
it, so:

- Ask no one anything, and do not commit. A script verifies the slice when
  you finish, then commits it or reverts it.
- Change only the files the slice names. A change anywhere else reverts the
  whole slice.
- Never edit `.codex/agents/`; the script regenerates it with the converter.
  An `agents` slice needs no edit from you.
- A `move` or `reduce-claude` slice moves text unchanged, so the scanner
  signals removed from the source equal those added at the destination.
- Keep the check-in contract in migrated instructions, as "Applying" states.

Before you finish, read `git diff` and check it for dropped instructions,
duplicate sources of truth, unresolved environment names and scope creep. Fix
what you find within the slice's files. In your final reply, list each changed
file and what the diff check found.
