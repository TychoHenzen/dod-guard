Delete what the maintainer approved for clean-house.

`$ARTIFACTS_DIR/approved.json` holds the approved items under `approved` and
the rest under `declined`. For each approved item:

1. Run `git rm` on every path in `delete`. Delete whole files; never empty one
   and leave it.
2. Update every file in `edits` so its reference to the dying side points at
   the newer side, `keep`, instead.
3. Remove each package in `dependencies` with the project's package manager
   (`npm remove`, `cargo remove`, `uv remove`), so the manifest and lockfile
   change together.

Then sweep again for each removed name and file stem, as "Stage 3: prove
removal safe" in `$PACK_DIR/skills/clean-house/SKILL.md` describes. Fix a
surviving reference only in a file the item lists in `edits`. Name every other
surviving reference in your final reply.

- Touch nothing the approval does not name: no other file, test, fixture, data
  or dependency. A partial approval binds, so a declined item stays whole.
- Do not run the checks and do not commit. The workflow does both.

A script reverts every deletion, edit, new file or rename the approval did not
name before the checks run.
