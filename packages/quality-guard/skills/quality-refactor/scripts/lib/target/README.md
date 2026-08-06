# Scanner fixture corpus -- not production code

Every file in this directory is a deliberately imperfect source sample,
one per supported language, used only by
`../language-fixtures.test.mjs` to pin the exact set of violations the
quality-scan scanner reports against real code. Each fixture's own header
comment carries a `quality-guard: off` marker for the same reason: the
violations in here are the point, not a defect to clean up.

Do not "fix" the else branches, the stateless methods, the TODO markers,
or anything else an editor, a formatter, or a language server flags in
these files. Do not run this repository's own linters or quality tooling
against this directory -- it is intentionally invisible to them:

- The scanner's own directory walk (`IGNORED_DIRS` in
  `../config.mjs`) skips any directory literally named `target`, which is
  why this one is named that. Both the CI structural-quality ratchet and
  a plain repo-wide scan inherit this, since both walk through the
  scanner's own `collectFiles`/`walkDir`.
- The `quality-guard` PostToolUse hook does not walk directories at all;
  it gates the one file a write touched. Each fixture carries the
  `quality-guard: off` header the hook already recognizes, so a write to
  one of these files is never gated in the first place.

If a fixture's expected violation set ever needs to change, that is a
sign the scanner's behavior changed -- update
`language-fixtures.test.mjs` deliberately, with the reason in the commit
message, rather than editing a fixture to make a failure go away.
