The checks failed after the clean-house deletion. Their output is in
`$ARTIFACTS_DIR/checks.txt`, and the approved items are in
`$ARTIFACTS_DIR/approved.json`.

Follow "After deleting" in `$PACK_DIR/skills/clean-house/SKILL.md`. Restore
only a deleted file that the failing output names, with
`git checkout HEAD -- <path>`. Do not patch around the failure, edit no file,
and restore nothing the output does not name. If the output names no deleted
file, restore nothing.

In your final reply, list each restored file with the output line that names
it, or say that the output named none.
