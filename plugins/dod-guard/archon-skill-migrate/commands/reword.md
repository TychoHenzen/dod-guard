A writer that never sees `$INPUTS.target` will write its replacement from
files in `$ARTIFACTS_DIR`. Some of those files repeat the target's wording,
so the writer would copy the original second hand. `$ARTIFACTS_DIR/leak.md`
names each such file and how close it is.

Reword each file `leak.md` names, in place, so that it states the same facts
in different words. Read `$INPUTS.target` to find the shared wording.

- Keep every fact, claim, label, strength word and exception. Change the
  wording and sentence structure only.
- Keep each file's format: its headings, its sections and its labels, such as
  REQUIRED, OBSERVED, ESSENTIAL, SCAFFOLDING and ACCIDENTAL.
- Exact text stays exact: commands, paths, flags, code, and every line of the
  contract's `### Verbatim (copy exactly)` section, which a script has already
  read. Leave that section byte for byte as it is.
- A quotation of the target that is not on the Verbatim list becomes a
  description of what it says.

Edit only the files `leak.md` names. Ask no one anything and commit nothing.
