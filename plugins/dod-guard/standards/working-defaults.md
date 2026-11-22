# Working defaults

Apply these defaults to every dod-guard skill. A skill-specific boundary can
be stricter when it protects authority, data, or an explicitly approved
destructive action.

- Choose the obvious low-risk option when the user request, PBI, repository
  instructions, and current evidence leave one answer. Do not ask for a
  second confirmation after an authorized choice is resolved.
- Ask or stop only for material ambiguity, missing authority, credentials or
  another security risk, destructive or irreversible intent, provider or
  commit-head mismatch, required evidence that cannot be obtained, or pending
  work that cannot be separated safely.
- For an ordinary failure, preserve the original checkpoint and record the
  exact error, stage, PBI, branch or head, and attempts. Read back remote state
  after an uncertain write, then classify the failure as transient/provider,
  stale state or race, code/test/quality, merge conflict, authorization/policy,
  or skill/runtime. Before classifying a missing provider, fixture, or tool
  capability as a blocker, compare it with the PBI's requested observable
  behavior: a capability the PBI itself adds or changes is implementation
  work, not an external blocker. A genuinely unavailable capability stays a
  blocker, recorded with the exact call, error, and what was checked. On a
  branch behind the fetched default, reclassify a failure only after the
  branch is current. Before a pull request exists, merge the fetched default
  into the branch, and stop with the conflicted paths on a merge conflict.
  Once one exists, use complete-pr's bounded branch synchronization, with
  merge conflicts going to `standards/conflict-triage.md`. Never rebase or
  force-push. Use the smallest reversible repair and its narrow proof, then
  resume that checkpoint.
  Retry an identical transient failure at most once. Do not retry a mutation
  before its readback, loop blindly, or convert a security, authority,
  destructive, provider/head, or missing-evidence stop into ordinary
  recovery. After local triage, a confirmed blocker must use
  `/codex-advisor`: Claude's advisor tool in Claude Code, otherwise Codex with
  `gpt-5.6-sol` at `max` effort. Its advice never replaces the invoking
  skill's repair or proof.
- Confirm every push. After `git push`, run
  `git ls-remote --heads origin <branch>` and `git rev-parse HEAD`: the first
  must print the SHA of the second. A push that exits non-zero is not yet a
  failed delivery. Read the remote first, because a push that reached origin
  needs nothing more. When it did not, and the error is a transient connection
  error such as `Failed to connect to github.com port 443`, retry the push with
  at most 5 attempts in all, pausing 5, 10, 20, and 20 seconds between attempts
  (`node -e "setTimeout(()=>{},5000)"` waits 5 seconds; change the number for the
  others) and reading the remote after each. This is the one exception to the single
  retry above, because pushing the same commits again is idempotent. An
  authorization, rejected-update, or non-fast-forward error is not transient:
  stop at once. When the remote still lacks the head after the last attempt,
  report the commits as unpushed work with both SHAs, and never call the branch pushed.
  A checkpoint or handoff comment waits for the confirmed head and is posted
  without a rescue once the head is on origin. When a skill stops after a task
  commit, first push the verified commits the same way, or
  name each commit that stays unpushed.
- For a skill that commits or pushes, inspect a dirty worktree first. Treat
  ordinary, clearly in-scope pending changes as input to its normal commit
  step: stage only reviewed in-scope paths and commit them on the target
  branch. Preserve and report secrets, destructive intent, and unrelated or
  indistinguishable changes. Dirty status alone is not a blocker. If the
  skill creates a branch from a fetched default, keep those changes
  uncommitted until the target branch exists, then commit them only there. If
  Git cannot retain them without conflict, stop rather than stash, discard, or
  commit them on another branch.
- Before selecting a delivery checkout, run `git worktree list --porcelain` and
  treat its first worktree as the main checkout. Run ordinary delivery there
  when it can safely create the selected branch from the fetched default while
  retaining classified in-scope changes. When it cannot, because it is locked,
  unavailable, or holds an active or unsafe user-owned branch, stop and report
  the reason, affected checkout, and recovery path. Never create, switch to, or
  remove a Git worktree.
  A worktree other than the first entry belongs to someone else. A check for
  worktrees reads `git worktree list --porcelain` and never fails because
  another one exists, and nothing touches it.
  The maintenance-only `/publish` route stays in the existing primary checkout
  and never runs a Git worktree command. Classify every pending path first and
  continue only when all paths are clearly release-scoped. Stop and preserve
  the complete tree if unrelated or indistinguishable work exists, or if Git
  cannot retain the release paths during the same-checkout transition. Never
  reset, stash, overwrite, move, or silently include user-owned changes.
- A failure in a touched path, required suite, user-facing flow, or required
  gate is not deferred as "pre-existing". Fix it, or record evidence that it
  is unrelated together with a recovery decision.
- Never edit an installed plugin cache, such as `~/.claude/plugins/` or a
  Codex plugin install; an update overwrites it. Fix a defective skill in its
  source checkout, and edit and commit only there. Find the checkout in this
  order: the current repository when its `.claude-plugin/marketplace.json`
  lists the plugin, then `~/mcp-servers/dod-guard` for a dod-guard skill, then
  the skill's own source repository. When none exists, make no edit and report
  the paths you looked for.
- When a clear contract and a test disagree, update the stale expectation and
  rerun it. Fix the implementation when it violates the contract. Never
  weaken or delete a test only to make it pass.
- Prefer small pure functions with explicit inputs and outputs, keep external
  I/O at boundaries, and use ordinary loops or mutation when clearer. Do not
  require a functional language or dense composition.
- Keep read-only review, explicit user approval, branch protection, and other
  authority boundaries. The explicit `/publish` maintenance-only route may
  temporarily disable only admin enforcement, then push a version-bumped
  fast-forward to `master` with `--force-with-lease` pinned to the saved SHA.
  Restore every saved protection setting immediately and keep all required
  checks. Other users remain subject to branch rules. These defaults do not
  permit unrelated external mutation or an unverified success claim.
- Never clone a repository to read files from another commit. Use `git show <rev>:<path>` for one file, or `git archive <rev> <path>... | tar -x -C <scratch-dir>` for several, into the scratchpad or a temporary directory outside the repository. A clone left under a short root such as `C:\dg*` can be undeletable from the sandbox.
