---
name: add-backlog-idea
description: Split a brain dump into independently deliverable features and add each as a concise issue to a chosen repository's linked GitHub Project backlog. Use when the user wants to capture work for later, not refine or implement it.
---

# Add backlog idea

This skill captures ideas. It does not refine, design, or build them.

Read `standards/working-defaults.md` and `standards/github-request-discipline.md` from the plugin root before you start. Where this skill is stricter, this skill wins.

Callers pass the whole request in one invocation; the only exception is the single batched round in "Ask one batched round when a user is present". Stop once every idea is in the backlog.

## What an issue is here

Each feature becomes one minimal, real GitHub issue. Never create a draft item: drafts cannot fill the Repository field.

The issue hands the problem to refinement, so outcome and scope are the problem handoff. On this structured path nothing else belongs in it. The issue's Repository field is its target repository. Do not do any of these:

- Inspect the codebase to find a design.
- Create a branch.
- Assign an owner.
- Add labels, assignees, acceptance criteria, implementation notes, or subtasks.
- Open a pull request.
- Derive new requirements, decisions, plans, or tasks.
- Edit or close an existing issue. Report it in the final report instead.

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
- When you cannot tell whether parts are separate features, create one issue that holds all of the text.

Give each feature a concise title.

## Place every detail

When splitting, map every substantive supplied detail to that feature, every relevant feature, or an explicit unresolved remainder. That covers rationale, examples, constraints, decisions, and open questions. Put shared context with each feature that needs it.

Do not silently omit, collapse, or paraphrase a concrete detail into a vague outcome. If some text fits no feature, it is the explicit unresolved remainder. When a user is present, ask where it belongs inside the round described in "Ask one batched round when a user is present". Otherwise report it as the unresolved remainder and let the caller decide.

A detail that maps to a feature but still has no settled decision after any batched round goes under that issue's `## Open questions`. Never drop it. This does not cover text that fits no feature: that stays the unresolved remainder described above.

Do not derive, resolve, or organize new requirements, decisions, plans, or tasks, and retain any supplied decision verbatim as `## Context`.

Write each issue body with these parts:

- `## Idea`: the requested outcome, in the user's terms.
- `## Context`: every mapped fact, rationale, example, constraint, and decision for this feature.
- `## Open questions`: include this only when decisions are still unresolved.

## Ask one batched round when a user is present

Run this round only when a person invoked this skill directly in an interactive session and the supplied text does not let you state a feature's outcome or the split. The unresolved remainder from "Place every detail" joins this round.

Skip the round, and ask nothing, in every other case: the text is already clear, another skill such as `dod-guard:quick-pbi` or `dod-guard:goal-sdlc` invoked this skill, or no user is present (a non-interactive or active goal run). If it is not clear that a person invoked this skill directly in an interactive session, skip the round. In a skipped run, put each open point under `## Open questions`. Text that fits no feature is not an open point: report it as the unresolved remainder in the final report, as "Place every detail" says.

When the round runs, ask once, in ordinary conversation, and never through a provider-specific question tool:

- Put every open question in one turn. Do not defer a known question to a later turn.
- Give each question 3 or 4 mutually exclusive options. Put the recommended option first and mark it `(Recommended)`. Add one short effect to every option. Always allow `Other: ...`.
- Label each question Low, Medium, or High by what a wrong answer costs. Low is absorbed cheaply. High files the wrong issue or the wrong split. Order the set from High to Low.
- End with a compact reply format, such as `Reply with 1A, 2C, plus any custom details.`
- Ground every question in the supplied text only. Do not read the codebase.

After the reply, keep each answer word for word under `## Context` of the feature it settles. Put each point still unanswered under `## Open questions`. Never run a second round. The capture-only rules above still apply.

## Create and file each issue

Before step 1 for each feature, look for a duplicate left by an earlier partial run. Run once per feature, using the resolved repository and leaving any double quote out of the title inside the search text:

```text
gh issue list --repo <owner/name> --search "<title> in:title" --state open --limit 100 --json number,title,url
```

A match is an open issue whose title equals the intended title after trimming and lowercasing. Ignore every other hit and never judge similarity. On a match, create no second issue and do not edit it. Report it as `existing issue #N` and run steps 2 and 3 for it.

For each feature, work in this order:

1. Create the issue.
2. Add it to the Project, using the add-item rules under "Write plan" in `standards/github-request-discipline.md`. An item that already exists counts as success.
3. Read its Status. When it has none, set it to `Backlog`. When it has one, change nothing and report it.

Never use GraphQL guidance for routine Project work.

## When something fails

On a partial failure, report every mapping that completed and name the exact feature that failed. Never retry by creating a duplicate issue. When step 1 succeeded for a feature and step 2 or 3 failed, keep its issue number, read back its Project membership and Status, and run again only the step that is missing for that issue. Never repeat step 1.

## Final report

List each feature with its issue number and URL. Then name the shared Project and the Backlog status they now sit in.
