# dod-guard plugin

This directory is a code-free plugin. It ships skills and six supporting agent
definitions. It has no package workspace, MCP server, or bundle.

## Delivery contract

- Resolve repository identity with the connected GitHub MCP operation. Use
  `gh repo view` only when MCP is unavailable.
- Select only the single open Project explicitly linked to that repository.
- Use `/add-backlog-idea` to split an unrefined brain dump into one Backlog
  issue per independently deliverable feature in its target repository.
  Backlog items are issues, not drafts. Use `/refine-backlog-item` to create a
  Todo PBI with observable acceptance criteria and only independent sub-issues.
  Research precedes priority, Fibonacci effort, and standard classification.
  Verify repository labels and their evidence before Todo; split Effort 13 epics.
- Use one `codex/<issue>-<slug>` branch and one draft pull request per issue.
- Use `/next-ticket` to execute a ready PBI. One independent completion reviewer
  challenges the final implementation before commit and push. Resolve or reject
  every challenge with evidence. Use `/submit-draft-pr` after verification.
- Use `/review-pr` for four-angle Git or GitHub inline review and Azure DevOps
  Markdown review reports. It never changes the reviewed branch.
- Use `/fix-pr-review` to revalidate and fix selected review findings. It
  updates provider state only after verified commits are pushed.
- Use `/complete-pr` only when the user explicitly accepts the current pull request.
  It owns guarded ready, auto-merge, issue confirmation, and remote branch
  deletion.
- Use `/publish` for a completed marketplace release. It sends every pending
  change through `/commit`, then delegates the draft pull request to
  `/submit-draft-pr`.
- Commit and push before closing code-backed sub-issues.
- Never approve, ready, merge, or close the agent's own pull request outside an
  explicit `/complete-pr` invocation.

The structured stage map and its issue handoff records live in
`standards/project-workflow.md`. Keep project principles in the repository's
existing `AGENTS.md` and `CLAUDE.md` instructions. Do not create a parallel
planning system or let structured work bypass the safety and authority stops.

All GitHub-facing skills also follow
`standards/github-request-discipline.md`. Resolve shared metadata once, reuse
the run snapshot, prefer narrow GitHub MCP operations or REST endpoints, and
reserve GraphQL for Project v2 or relationships without a REST equivalent.

## Validation

From the repository root:

```text
node scripts/ci/validate-plugins.mjs
npm run test:dod-guard-skills
```

Keep manifest skill and agent counts aligned with the directories that ship.
