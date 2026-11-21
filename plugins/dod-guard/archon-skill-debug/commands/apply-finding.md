Apply one accepted skill-debug finding. It is in
`$ARTIFACTS_DIR/current.json`: its `title`, `cause`, the `file` the edit goes
in, and the `fix`. The full report with evidence is in
`$ARTIFACTS_DIR/report.md`.

Follow "After acceptance" in `$PACK_DIR/skills/skill-debug/SKILL.md` for this
one finding. The maintainer already accepted it, so:

- Make one edit, in the named file only, as it is in this checkout. A change
  to any other file reverts the edit.
- Touch only the failing text. Leave its neighbors alone and fold in no
  unrelated rewriting.
- Ask no one anything, and do not commit. A script verifies and commits the
  edit when you finish.

In your final reply, quote the text you replaced and the text that replaced it.
