---
name: next-ticket
description: Take a GitHub Project issue from the current repository through a feature branch, verified implementation, and draft pull request. Use when the user asks to pick up, start, or continue a project ticket.
---

# Next ticket

Use the current Git checkout as the source of truth. Never choose a project by
title similarity or from a remembered owner.

After selection, create the ticket's feature branch, assign the issue, move it
to the project's in-progress status, implement it, and open a verified draft
pull request.

## Preconditions

1. Confirm the current directory is inside a Git worktree.
2. Run `gh auth status`. Stop if the active token lacks `repo` or `project`.
3. Read `git status --short --branch`. Stop if the worktree has tracked or
   untracked changes. List the paths that prevent a clean start.

## Resolve the repository

Run:

```text
gh repo view --json nameWithOwner,defaultBranchRef,url
```

Use `nameWithOwner` as the repository identity. Do not derive identity by
parsing an `origin` URL when `gh repo view` succeeds. Stop if the repository
has no GitHub remote or no default branch.

## Resolve the linked project

Query the repository's `projectsV2` GraphQL connection. Request each project's
`id`, `number`, `title`, `closed`, and owner login.

Keep only open projects. The repository must have exactly one open linked
project:

- No match: stop and explain that an administrator must link a GitHub Project
  to this repository.
- More than one match: stop and list each owner, number, and title. Do not pick
  one by name.
- One match: report its owner, number, and title, then use it for ticket lookup.

This explicit repository link is the only supported repository-to-project
mapping. It works for personal and organization projects.

## Select a ticket

If the user supplied an issue number, verify that it belongs to this repository
and appears in the linked project.

Without an issue number, list open project items from this repository. Exclude
pull requests and issues already assigned to someone else. Show the issue
number, title, assignee, and status. If exactly one issue remains, select it.
Otherwise let the user choose.

Before reporting a ticket as ready, read its body and require:

- a short description of the intended change;
- implementation notes;
- acceptance criteria written as checkboxes with observable outcomes.

Stop and name the missing section when the issue is incomplete. Do not invent
requirements.

## Prepare the mutation

Resolve every value before changing local or remote state:

1. Fetch the remote default branch.
2. Turn the issue title into a lowercase ASCII slug. Keep letters, digits, and
   single hyphens. Remove leading and trailing hyphens.
3. Form the branch name `codex/<issue-number>-<slug>`. Keep the complete name
   under 64 characters by shortening only the slug.
4. Confirm that the branch name exists neither locally nor on `origin`.
5. Read the linked project's fields and find exactly one `Status` field with
   exactly one case-insensitive `In Progress` option.
6. Resolve the selected issue's project item id, the project id, the Status
   field id, and the In Progress option id.

Stop before any mutation if a value is missing or ambiguous. Never hardcode a
project, field, option, repository, default branch, or user id from an earlier
run.

Selecting a ticket authorizes the branch, assignment, and status mutations
below. Do not ask for another confirmation when the requested ticket and every
resolved value are unambiguous.

## Start the ticket

Perform these actions in order:

1. Create the local branch from the fetched remote default branch.
2. Push it with upstream tracking to the branch of the same name on `origin`.
3. Assign the issue to the active GitHub user with `gh issue edit` and
   `--add-assignee @me`.
4. Set the issue's project Status to `In Progress` with
   `gh project item-edit` and the ids resolved above.

Do not create or switch to an existing branch. Report the exact completed
actions if a later mutation fails. Keep the successfully created branch and
remote state for diagnosis instead of attempting an automatic rollback.

## Implement the issue

Read the repository instructions that apply to every file the issue touches.
Treat the issue description, implementation notes, and acceptance criteria as
the task contract. Do not add behavior that the issue does not require.

Inspect the affected code, its callers, and its existing tests before editing.
Implement every acceptance criterion. Add or update tests where an observable
criterion can be checked automatically. Follow any smaller-step boundary in the
repository's own instructions.

Do not create a tracked planning document. Temporary working notes must stay
outside the repository or be removed before the commit.

## Verify and prepare generated files

Use the repository's documented build, test, lint, and formatting commands.
Run focused checks while implementing, then run every required pre-PR gate.

Generate tracked build outputs and ratchet baselines on the feature branch when
the repository requires them. Inspect those changes as part of the same review.
Do not rely on CI to write generated files or repair the branch.

Map each acceptance criterion to fresh evidence. Stop before committing when a
criterion is unmet, a required check fails, or required proof cannot run. State
the exact failed command or unverified criterion.

## Commit and push

Inspect `git status`, the complete diff, and the staged diff. Preserve unrelated
files and never use a blanket staging command. Stage only reviewed files that
belong to the issue.

Create a concise commit that names the implemented outcome. Push the current
branch to its existing upstream. Do not force-push or rewrite existing commits.

## Open the draft pull request

Confirm no open pull request already uses this head branch. Create one draft PR
against the resolved default branch with an explicit title and body.

Keep the body short. Include:

- what changed and why;
- the material verification commands and results;
- the issue's acceptance checklist, checked only where evidence exists;
- `Closes #<issue-number>`.

The closing keyword closes the issue only after merge. Leave the Project status
as `In Progress` while the PR is open.

Never approve the PR, mark it ready for review, merge it, close it, or close the
issue. These are human-owned actions even when the active GitHub credential has
permission to perform them.

## Result

Report the repository, linked project, selected issue, branch, commit, checks,
and draft PR URL. Name any check that could not run. Stop after creating the
draft PR.
