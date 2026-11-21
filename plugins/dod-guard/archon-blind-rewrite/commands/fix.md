A blind rewrite of `$INPUTS.target` fails the repository's checks. Make them
pass.

- The check command: `$contract.output.checks`
- Its last output, from before the first fix: `$ARTIFACTS_DIR/checks.txt`
- The behavior contract: `$ARTIFACTS_DIR/contract.md`, and a person's ruling in
  `$ARTIFACTS_DIR/answer.md` if it exists.

Run the check command yourself and fix what fails. Fix from the contract and
the rewrite alone. Never read the original in any form: no `git show`,
`git log -p`, `git diff` against the start commit, `git stash`, other branches,
other checkouts, any path under `$ARTIFACTS_DIR` other than the three files
above, session logs and transcripts (`~/.archon` outside `$PACK_DIR` and those
files, and `~/.claude`), or index and cache folders that code tools keep in the
checkout. Never restore the original, even in part.

Change the rewrite at `$INPUTS.target`. Change a test only when the test asserts
the original's private structure rather than behavior the contract names; say
so in your reply. Change nothing else.

Do not commit. Reply with what failed, what you changed, and the check result.
