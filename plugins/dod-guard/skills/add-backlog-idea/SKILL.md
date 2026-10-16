---
name: add-backlog-idea
description: Split a brain dump into independently deliverable features and add each as a concise issue to a chosen repository's linked GitHub Project backlog. Use when the user wants to capture work for later, not refine or implement it.
---

# Add backlog idea

This skill captures ideas. It does not refine, design, or build them.

Read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root before you start. Where this skill is stricter, this skill wins.

Callers pass the whole request in one invocation. Stop once every idea is in the backlog.

## What an issue is here

Each feature becomes one minimal, real GitHub issue. Never create a draft item: drafts cannot fill the Repository field.

The issue hands the problem to refinement, so outcome and scope are the problem handoff. On this structured path nothing else belongs in it. The issue's Repository field is its target repository. Do not do any of these:

- Inspect the codebase to find a design.
- Create a branch.
- Assign an owner.
- Add labels, assignees, acceptance criteria, implementation notes, or subtasks.
- Open a pull request.
- Derive new requirements, decisions, plans, or tasks.

Keep any decision the user supplied word for word under `## Context`. Refinement happens later, with `dod-guard:refine-backlog-item`.

## Choose the repository

1. If the user supplied a target repository, use it. Always.
2. Otherwise use the repository of the current directory. Try GitHub MCP first, then `gh repo view --json nameWithOwner,defaultBranchRef,url`.
3. If there is no target and the current directory is not a valid repository, list repositories with the GitHub MCP identity and repository-list operations first. Fall back to `gh api user --jq .login`, then `gh repo list <login> --limit 100 --json nameWithOwner,description,url`.
4. Show those repositories as a numbered list and ask which one to use. Create nothing until the user chooses.

## Resolve once, before creating anything

Follow "Resolve the repository and Project" in `standards/github-request-discipline.md`. Resolve the repository, your access to it, the linked Project, its Status field, and the `Backlog` option one time. Reuse the results for every issue.

Find the Project with:

```text
node <plugin-root>/skills/complete-pr/scripts/linked-project.mjs --repository=<owner/name>
```

For a supplied or chosen target, resolve access with `gh repo view <target>` and pass `--repository=` that repository's `nameWithOwner`. Run it once, and stop on outcome `none` or `several` or on exit 2. Tell the user what the script reported and create nothing.

## Split the request into features

Split only on genuinely separate observable outcomes. A feature qualifies when it is useful alone and someone can implement, verify, and close it without the others.

- Prefer one feature when the parts add up to one user-visible capability.
- Layers, components, steps, tests, and docs are not features.
- A request that describes one feature stays one issue.

Give each feature a concise title.

## Place every detail

When splitting, map every substantive supplied detail to that feature, every relevant feature, or an explicit unresolved remainder. That covers rationale, examples, constraints, decisions, and open questions. Put shared context with each feature that needs it.

Do not silently omit, collapse, or paraphrase a concrete detail into a vague outcome. If some text fits no feature, show it to the user as the explicit unresolved remainder and ask where it belongs.

Do not derive, resolve, or organize new requirements, decisions, plans, or tasks, and retain any supplied decision verbatim as `## Context`.

Write each issue body with these parts:

- `## Idea`: the requested outcome, in the user's terms.
- `## Context`: every mapped fact, rationale, example, constraint, and decision for this feature.
- `## Open questions`: include this only when decisions are still unresolved.

## Create and file each issue

For each feature, work in this order:

1. Create the issue.
2. Add it to the Project, using the add-item rules under "Write plan" in `standards/github-request-discipline.md`. An item that already exists counts as success.
3. Set its Status to `Backlog`.

Never use GraphQL guidance for routine Project work.

## When something fails

On a partial failure, report every mapping that completed and name the exact feature that failed. Never retry by creating a duplicate issue.

## Final report

List each feature with its issue number and URL. Then name the shared Project and the Backlog status they now sit in.
