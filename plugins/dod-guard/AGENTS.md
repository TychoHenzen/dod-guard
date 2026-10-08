# dod-guard plugin

This directory is a code-free plugin. It ships skills and thirteen supporting agent
definitions. It has no package workspace, MCP server, or bundle.

## Delivery contract

- Resolve repository identity with the connected GitHub MCP operation. Use
  `gh repo view` only when MCP is unavailable.
- Select only the single open Project explicitly linked to that repository.
- Use `/add-backlog-idea` to split an unrefined brain dump into one Backlog
  issue per independently deliverable feature in its target repository.
  Backlog items are issues, not drafts. Use `/refine-backlog-item` to create a
  Todo PBI with observable acceptance criteria, ordinary independent sub-issues,
  and functional-slice children only when independent delivery warrants them.
  Research precedes priority, Fibonacci effort, and standard classification.
  Verify repository labels and their evidence before Todo; split Effort 13 epics.
- Use one `codex/<issue>-<slug>` branch and one draft pull request per issue.
- Use `/next-ticket` to execute a ready PBI. It maps every acceptance
  criterion to fresh evidence before commit and push. Use `/submit-draft-pr`
  after verification.
- Use `/review-pr` as the one independent review: it scans the changed files
  with quality-guard, runs four reviewer agents, and posts one comment-only
  GitHub review with a recommendation. It never changes the reviewed branch.
- Use `/fix-pr-review` to revalidate and fix selected review findings. It
  updates provider state only after verified commits are pushed.
- Use `/complete-pr` as the final acceptance gate after implementation, review,
  remediation, and current-head checks. It owns guarded ready, REST merge,
  issue confirmation, and remote branch deletion; it verifies completion rather
  than waiting for a separate human-approval step. Where the repository uses
  Codex code review, `/submit-draft-pr` requests it and `/complete-pr` finishes
  it before merging.
- Use `/goal-sdlc` to run that lifecycle across the linked Project queue, one
  parent PBI at a time.
- Use `/publish` for a completed marketplace release. Functional releases
  require a PBI and draft PR. Maintenance-only releases skip both and push a
  version-bumped fast-forward with `--force-with-lease` pinned to the saved
  `master` SHA after validation. Temporarily disable only admin enforcement if
  needed, then restore the complete saved protection immediately.
- Commit and push before closing code-backed sub-issues.
- Never approve, ready, merge, or close the agent's own pull request outside the
  `/complete-pr` verification gate.

The structured stage map and its issue handoff records live in
`standards/project-workflow.md`. Keep project principles in the repository's
existing `AGENTS.md` and `CLAUDE.md` instructions. Do not create a parallel
planning system or let structured work bypass the safety and authority stops.

All GitHub-facing skills also follow
`standards/github-request-discipline.md`. Resolve shared metadata once, reuse
the run snapshot, prefer narrow GitHub MCP operations or REST endpoints, and
reserve GraphQL only for a relationship or mutation without a connector or
REST equivalent.

## Validation

From the repository root:

```text
node scripts/ci/validate-plugins.mjs
npm run test:dod-guard-skills
```

Keep manifest skill and agent counts aligned with the directories that ship.
Every shipped skill reads `standards/working-defaults.md`; keep the policy
inventory test aligned with that standard and with the delivery exceptions.
