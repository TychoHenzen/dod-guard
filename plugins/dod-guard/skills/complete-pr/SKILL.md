---
name: complete-pr
description: Complete an explicitly accepted open pull request through guarded auto-merge, required checks, linked-issue confirmation, and remote branch deletion.
---

# Complete PR

Treat invocation of this skill as the user's explicit acceptance of the current
pull request code. Do not infer acceptance from review comments, passing checks,
or an earlier command.

## Resolve the pull request

1. Confirm the current directory is inside a clean Git worktree.
2. Run `gh auth status`. Require `repo` access.
3. Resolve the repository and default branch with
   `gh repo view --json nameWithOwner,defaultBranchRef,url`.
4. Resolve the one open pull request for the current branch, or use the pull
   request number supplied by the user. Accept either a draft or ready pull
   request whose head belongs to the current repository and whose base is the
   default branch.
5. Read the pull request, linked issue, review result, and latest verification
   evidence. Stop if the draft does not represent the reviewed and verified code.

## Complete the accepted pull request

Resolve this skill's directory from the loaded `SKILL.md`, then run:

```text
node <skill-dir>/scripts/complete-pr.mjs <owner/repository> <pull-request-number>
```

The helper records the accepted head SHA first. If the pull request is a draft,
it marks it ready. If it is already ready, it preserves that state. It then:

- enables repository auto-merge when needed;
- enables merge-commit auto-merge with `--match-head-commit`;
- waits for every required check and stops on failure or cancellation;
- updates a stale branch only with its trusted head SHA;
- accepts an update commit only when its parents are the prior trusted head and
  the observed base head;
- repeats guarded updates if the base advances again;
- stops on conflicts, unexpected pushes, permission failures, or bounded waits;
- confirms the merge commit and linked closing issue state;
- verifies the same-repository remote branch still points to the merged head,
  deletes it, and confirms it is absent.

Never use `--admin`, force-push, weaken repository protections, or delete a ref
whose SHA differs from the merged pull request head.

## Result

Report the pull request, accepted head, final trusted head, merge commit, linked
issue state, and remote branch deletion. Stop after the helper succeeds or
returns a specific failure code. Publishing and plugin-cache refresh remain
separate workflows.
