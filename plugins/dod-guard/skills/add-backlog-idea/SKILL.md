---
name: add-backlog-idea
description: Add a concise idea to a chosen repository and its linked GitHub Project backlog. Use when the user wants to capture work for later, not refine or implement it.
---

# Add backlog idea

Create one minimal GitHub issue in the user-chosen target repository. Do not
inspect the codebase for a design, create a branch, assign an owner, or add
implementation subtasks.

## Resolve the destination

1. Confirm the target repository is explicit. Stop and ask for it if it is not.
2. Run `gh auth status`. Stop if the active credential lacks `repo` or
   `project` access.
3. Resolve the target with `gh repo view <target> --json nameWithOwner,defaultBranchRef,url`.
4. Query that repository's `projectsV2` connection. Keep only open projects.
   Stop unless exactly one open Project is explicitly linked to the repository.
5. Resolve exactly one `Status` field and one case-insensitive `Backlog` option.
   Stop if either is absent or ambiguous.

## Create the idea

Create an issue in the target repository with the user-provided title and a
short body containing:

- `## Idea`: the requested outcome in the user's terms;
- `## Context`: only facts the user supplied;
- `## Open questions`: unresolved decisions, if any.

Add the issue to the resolved Project and set Status to `Backlog`. The issue's
Repository field is its target repository. Do not create a draft issue. GitHub
draft issues cannot populate that field. Do not add acceptance criteria,
implementation notes, labels, assignees, a branch, or a PR.

Report the issue number, URL, Project, and Status. Stop after the idea is in the
backlog.
