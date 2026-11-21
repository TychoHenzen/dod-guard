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
branches, other checkouts, or any path under `$ARTIFACTS_DIR` other than the
two files above. Write each restored behavior in the rewrite's own structure;
do not rebuild the original's.

When a reported gap is not real (the contract does not hold it, or the rewrite
already delivers it), leave it and say why.

Change only `$INPUTS.target`. Do not commit. Reply with each gap and what you
did about it.
