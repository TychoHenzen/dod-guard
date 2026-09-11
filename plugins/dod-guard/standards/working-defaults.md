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
- For a skill that commits or pushes, inspect a dirty worktree first. Treat
  ordinary, clearly in-scope pending changes as input to its normal `/commit`
  path. Preserve and report secrets, destructive intent, and unrelated or
  indistinguishable changes. Dirty status alone is not a blocker. If the
  skill creates a branch from a fetched default, keep those changes
  uncommitted until the target branch exists, then commit them only there. If
  Git cannot retain them without conflict, stop rather than stash, discard, or
  commit them on another branch.
- When a clear contract and a test disagree, update the stale expectation and
  rerun it. Fix the implementation when it violates the contract. Never
  weaken or delete a test only to make it pass.
- Prefer small pure functions with explicit inputs and outputs, keep external
  I/O at boundaries, and use ordinary loops or mutation when clearer. Do not
  require a functional language or dense composition.
- Keep read-only review, explicit user approval, branch protection, and other
  authority boundaries. These defaults do not permit external mutation or a
  claim of unverified success.
