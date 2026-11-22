A gap audit found behavior or claims that a blind rewrite of `$INPUTS.target`
dropped. Restore each one in the rewrite.

The audit report:

$audit.output.report

- The behavior contract: `$ARTIFACTS_DIR/contract.md`, and a person's ruling in
  `$ARTIFACTS_DIR/answer.md` if it exists.
- The check command, which must pass when you finish: `$contract.output.checks`
  (empty means the target has no check command; then the audit is the check).

Repair from the report and the contract alone. Never read the original in any
form: no `git show`, `git log -p`, `git diff` against the start commit, other
branches, other checkouts, any path under `$ARTIFACTS_DIR` other than the two
files above, session logs and transcripts (`~/.archon` outside `$PACK_DIR` and
those files, and `~/.claude`), or index and cache folders that code tools keep
in the checkout. Write each restored behavior in the rewrite's own structure;
do not rebuild the original's.

Restore every reported gap, including one the contract missed: the auditor
compared the rewrite with the original itself. Leave a gap only when the
rewrite already delivers it or `answer.md` approves the cut, and say which.

Change only `$INPUTS.target`. Do not commit. Reply with each gap and what you
did about it.
