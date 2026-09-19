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
  or skill/runtime. Use the smallest reversible repair and its narrow proof,
  then resume that checkpoint. Retry an identical transient failure at most
  once. Do not retry a mutation before its readback, loop blindly, or convert a
  security, authority, destructive, provider/head, or missing-evidence stop
  into ordinary recovery. After local triage, a confirmed blocker may use
  `/codex-advisor` with `gpt-5.6-luna` at `max` effort; its advice never
  replaces the invoking skill's repair or proof.
- For a skill that commits or pushes, inspect a dirty worktree first. Treat
  ordinary, clearly in-scope pending changes as input to its normal `/commit`
  path. Preserve and report secrets, destructive intent, and unrelated or
  indistinguishable changes. Dirty status alone is not a blocker. If the
  skill creates a branch from a fetched default, keep those changes
  uncommitted until the target branch exists, then commit them only there. If
  Git cannot retain them without conflict, stop rather than stash, discard, or
  commit them on another branch.
- Before selecting a delivery checkout, run `git worktree list --porcelain` and
  treat its first worktree as the main checkout. Run ordinary delivery there
  when it can safely create the selected branch from the fetched default while
  retaining classified in-scope changes. When it cannot—because it is locked,
  unavailable, or holds an active or unsafe user-owned branch—create one
  isolated worktree and record the reason, affected checkout, and recovery path.
  The maintenance-only `/publish` contract remains the only release exception:
  its exact-`origin/master` worktree protects the source checkout. Never reset,
  stash, overwrite, move, or silently include user-owned changes to make the
  main checkout available.
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
