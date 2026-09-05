---
name: next-ticket
description: Execute a refined GitHub Project PBI through implementation, independent completion review, verified commits, and a pushed branch. Use when the user asks to pick up, start, or continue a ready PBI. Use submit-draft-pr to create its pull request.
---

# Next ticket

Use the current Git checkout as the source of truth. Never choose a project by
title similarity or from a remembered owner.

After selection, create the PBI's feature branch, assign the issue, move it
to In Progress, implement it, verify it, review completion, commit it, and push
the branch.

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

Without an issue number, list open project items from this repository. Keep
only unassigned issues whose Status is exactly `Todo`, and exclude pull
requests. Show the issue number, title, assignee, and status. If exactly one
issue remains, select it. Otherwise let the user choose.

Before reporting a ticket as ready, read its body and require:

- a short description of the intended change;
- implementation notes;
- acceptance criteria written as checkboxes with observable outcomes.

Require every linked sub-issue to be open or closed with pushed implementation
evidence. A parent PBI with no linked sub-issues is valid when its acceptance
criteria form one coherent implementation slice.

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
   exactly one case-insensitive `Todo` option and one case-insensitive
   `In Progress` option.
6. Confirm the selected PBI currently has Status `Todo`. Resolve its project
   item id, the project id, the Status field id, and the In Progress option id.

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

## Independent completion review

After implementation and initial verification, invoke one fresh independent
reviewer through the active client's subagent tool. Do not reuse an implementer
or substitute your own review. If independent review is unavailable or fails,
stop before committing or pushing implementation changes and report the missing
review. The initial branch-only push in Start the ticket remains permitted.

Give the reviewer the parent PBI's full description, implementation notes, and
acceptance criteria. Include every linked sub-issue and its pushed evidence when closed.
Supply all applicable repository instructions and the complete final diff against the
fetched default-branch base, including staged, unstaged, and new files.
Include relevant final files and callers, plus current commands, results, and user-path
evidence mapped to each criterion. State explicitly when there are no sub-issues.
Provide this context directly, without requiring earlier conversation history.

Use this review brief:

> Challenge the claim that this PBI and every linked sub-issue are complete.
> Favor false positives: report concrete requirement or evidence gaps even when
> uncertain. For each challenge, give an ID, the requirement, file or evidence
> location, the suspected gap, and the check that could resolve it. State when
> no gaps are found. Stay read-only. Do not edit code, expand the PBI, publish
> comments, commit, push, approve, mark ready, merge, or close a pull request or
> issue. Unsupported preferences are not new requirements.

Independently check every challenge against the PBI contract and final files.
Keep each challenge and its disposition in the session's completion evidence:

- `resolved`: a valid gap was fixed, with the changed location and fresh passing
  verification that proves the requirement now holds.
- `invalid`: current files or verification disprove the claimed gap, with the
  exact evidence.
- `irrelevant`: the challenge asks for behavior outside the PBI, with the
  requirement or scope boundary that excludes it.

A valid unresolved gap blocks completion, commit, and implementation push.
Return to the owning implementation step, fix it, and rerun affected checks.
Then repeat independent review with the updated diff, files, verification, and
challenge dispositions. Do not label an unresolved gap resolved or dismiss a
finding solely because tests pass. Stop if required evidence cannot be obtained.
Any later implementation change invalidates the reviewed state and requires
affected verification and another review before commit and push.

Proceed only after review has completed and every challenge has an evidenced
disposition. Record a no-gap result explicitly. Stop or close the reviewer when
its work is finished. Keep this gate local to ticket execution. `/review-pr`
continues to own branch and pull-request review.

## Commit and push

Inspect `git status`, the complete diff, and the staged diff. Preserve unrelated
files and never use a blanket staging command. Stage only reviewed files that
belong to the issue.

Create a concise commit that names the implemented outcome. Push the current
branch to its existing upstream. Do not force-push or rewrite existing commits.

## Result

Report the repository, linked project, selected issue, branch, commit, checks,
and pushed branch. Include the completion-review result and every challenge's
disposition with evidence. Name any check that could not run. Stop after the push.
