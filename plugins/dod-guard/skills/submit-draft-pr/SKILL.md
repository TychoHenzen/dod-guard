---
name: submit-draft-pr
description: Create or update the draft pull request for a pushed PBI branch using fresh acceptance and verification evidence. Use after next-ticket, not to implement, approve, or merge.
---

# Submit draft PR

Create or update the one draft pull request for a pushed parent-PBI branch. Do
not change implementation scope, approve, mark ready, merge, close the PR, or
close the parent issue.

## Preconditions

1. Resolve the repository and default branch with `gh repo view --json nameWithOwner,defaultBranchRef,url`.
2. Verify the supplied parent issue belongs to that repository, is in its one
   open linked Project, and has Status `In Progress`.
3. Verify the current branch is the PBI's `codex/<issue>-<slug>` branch, has an
   upstream on `origin`, and has pushed commits ahead of the default branch.
4. Read the PBI and its linked sub-issues. Stop if a required acceptance
   criterion lacks evidence or a code-backed closed sub-issue lacks a pushed
   implementation commit.

Run the repository's required pre-PR checks when fresh evidence is unavailable.
Stop on a failed or unavailable required check.

## Create or update the draft

Confirm whether an open PR already uses the current head branch. If none exists,
create one draft PR against the resolved default branch. If one exists, update
its title and body instead of creating another PR.

Keep the body short. Include:

- what changed and why;
- the material verification commands and results;
- the parent acceptance checklist, checked only where evidence exists;
- `Closes #<issue-number>`.

Leave the Project item `In Progress`. Report the PR URL, head commit, and
verification evidence. Stop after the draft PR is updated.
