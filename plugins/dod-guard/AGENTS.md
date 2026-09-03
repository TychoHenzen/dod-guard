# dod-guard plugin

This directory is a code-free plugin. It ships skills and two supporting agent
definitions. It has no package workspace, MCP server, or bundle.

## Delivery contract

- Resolve repository identity with `gh repo view`.
- Select only the single open Project explicitly linked to that repository.
- Use `/add-backlog-idea` to capture unrefined work in its target repository.
  Backlog items are issues, not drafts. Use `/refine-backlog-item` to create a
  Todo PBI with observable acceptance criteria and only independent sub-issues.
- Use one `codex/<issue>-<slug>` branch and one draft pull request per issue.
- Use `/next-ticket` to execute and push a ready PBI. Use `/submit-draft-pr`
  only after its verification evidence exists.
- Use `/publish` for a completed marketplace release. It sends every pending
  change through `/commit`, then delegates the draft pull request to
  `/submit-draft-pr`.
- Commit and push before closing code-backed sub-issues.
- Never approve, ready, merge, or close the agent's own pull request.

## Validation

From the repository root:

```text
node scripts/ci/validate-plugins.mjs
npm run test:dod-guard-skills
```

Keep manifest skill and agent counts aligned with the directories that ship.
