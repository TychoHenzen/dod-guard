---
name: add-backlog-idea
description: Split a brain dump into independently deliverable features and add each as a concise issue to a chosen repository's linked GitHub Project backlog. Use when the user wants to capture work for later, not refine or implement it.
---

# Add backlog idea

Create one minimal GitHub issue per independently deliverable feature in the
user-chosen target repository. Do not inspect the codebase for a design, create
a branch, assign an owner, or add implementation subtasks.

For the structured path, the issue's concise outcome and scope are the problem
handoff to `/refine-backlog-item`. Keep requirements, decisions, plans, and
tasks out of this capture step.

Before GitHub calls, read `<plugin-root>/standards/github-request-discipline.md`.

## Split the request

Before creating anything, split the user's request only when it contains
genuinely separate observable outcomes. A separate feature is useful on its own
and can be implemented, verified, and closed without the other outcomes.
Prefer one feature when several parts combine into one user-visible capability.
Implementation layers, components, delivery steps, tests, documentation, and
related details for that capability are not separate features.

For each feature, prepare a concise title and retain only its relevant idea,
context, and open questions. Keep shared context with every feature that needs
it. If supplied text cannot be assigned to a feature, show that text and ask
the user where it belongs. Do not silently omit it. A request with one feature
must remain one feature.

## Shared working defaults

Read and apply `standards/working-defaults.md` from the plugin root. Local
safety or authority boundaries below remain stricter.

## Resolve the destination

1. If the user supplied a target repository, use it. Otherwise use the GitHub
   MCP repository operation from the current working directory. If MCP is
   unavailable, run `gh repo view --json nameWithOwner,defaultBranchRef,url`.
   If it succeeds, use that repository.
2. If no target was supplied and the current directory is not a valid GitHub
   repository, use the GitHub MCP identity and repository-list operations, or
   run `gh api user --jq .login`, then
   `gh repo list <login> --limit 100 --json nameWithOwner,description,url`.
   Show the available repositories as a numbered list and ask the user to
   choose one. Do not create anything until they choose.
3. Verify the connected GitHub MCP identity and required repository and Project
   access. If MCP is unavailable, run `gh auth status`. Stop if access is
   missing.
4. Resolve the selected target with the GitHub MCP repository operation, or
   `gh repo view <target> --json nameWithOwner,defaultBranchRef,url` when it
   was supplied or chosen from the list.
5. Query that repository's `projectsV2` connection once. Keep only open projects.
   Stop unless exactly one open Project is explicitly linked to the repository.
6. Resolve exactly one `Status` field and one case-insensitive `Backlog` option
   once. Stop if either is absent or ambiguous.

## Create the idea

For each prepared feature, create a repository issue with its concise title
and a short body containing:

- `## Idea`: that feature's requested outcome in the user's terms;
- `## Context`: only facts the user supplied;
- `## Open questions`: unresolved decisions, if any.

After creating each issue, add it to the resolved Project and set Status to
`Backlog`. Reuse the repository, Project, Status field, and Backlog option
resolved before creation. The issue's Repository field is its target
repository. Do not create a draft issue. GitHub draft issues cannot populate
that field. Do not add acceptance criteria, implementation notes, labels,
assignees, a branch, or a PR.

Report every identified feature and its issue number and URL, plus the shared
Project and `Backlog` status. If creation or Project placement fails partway,
report every completed mapping and the exact failed feature. Do not retry by
creating a duplicate issue. Stop after all created ideas are in the backlog.
