# dod-guard

A code-free plugin for GitHub issue delivery and focused repository
maintenance.

Every skill applies the shared working defaults in
`standards/working-defaults.md`: clear low-risk choices proceed, ordinary
dirty worktree changes use the normal commit path, stale tests follow the
current contract, and explicit safety or authority boundaries remain.

## Repository setup

`/setup-repository` connects a local project to GitHub, merges applicable
quality gates and delivery instructions, links one Project, enables supported
security settings, and protects the observed default branch after its checks
pass. It preserves existing Git history, remotes, instructions, ignore rules,
and tool configuration.

## Delivery workflow

`/add-backlog-idea` splits a brain dump into independently deliverable Backlog
issues. `/refine-backlog-item` researches one, triages missing user constraints
and external context, uses interview or targeted research as needed, and uses
debate only after facts and constraints are known. It then assigns justified
priority, Fibonacci effort, and standard labels before moving a coherent,
independently deliverable PBI to Todo. Material unresolved requirements keep
the issue in Backlog. Epics stay there until split into independently
deliverable PBIs. `/next-ticket`
implements that PBI and runs one independent completion review before committing
and pushing implementation changes. Every challenge needs an evidenced
disposition. `/submit-draft-pr` submits its verified draft
pull request. `/review-pr` checks the final branch or pull request with four
independent reviewers. After review, `/complete-pr` treats its invocation as
acceptance of the current head and completes the guarded merge.
`/fix-pr-review` revalidates and fixes selected review findings before that
acceptance. Each delivery skill resolves the current repository and requires
exactly one open GitHub Project explicitly linked to it.

`/quick-pbi` runs those delivery stages in order for a user request. It asks
questions only when `/refine-backlog-item` needs material clarification.

One issue becomes one branch and one draft pull request:

```text
backlog idea -> research and discovery -> coherent Todo PBI -> codex/<issue>-<slug> -> verified commits -> draft PR -> accepted merge
```

The issue holds the requested outcome and acceptance sub-issues. The branch
holds implementation. The pull request holds the result and verification. A
human review followed by `/complete-pr` is the explicit acceptance boundary.

For feature work or material ambiguity, use the structured path in the
[`standards/project-workflow.md`](standards/project-workflow.md):

| Stage | Owner | GitHub-backed artifact | Handoff |
| --- | --- | --- | --- |
| Principles | `/setup-repository` | Repository instructions | Existing rules guide capture and refinement. |
| Problem | `/add-backlog-idea` | Issue in `Backlog` with concise outcome and scope | Refine one coherent issue. |
| Requirements | `/refine-backlog-item` | Issue `Outcome`, `Scope`, and checked `Acceptance criteria` | Clarify gaps, then plan. |
| Clarification | `/refine-backlog-item` | `Implementation notes` with decisions and discovery evidence | Only resolved requirements enter the plan. |
| Plan | `/refine-backlog-item` | `implementation-plan` record in the issue | Break the plan into actionable tasks. |
| Tasks | `/refine-backlog-item` | `task-list` record and independent linked sub-issues only when needed | `Todo` PBI hands the task list to implementation. |
| Implementation handoff | `/next-ticket` | Issue task list, issue branch, commits, and verification evidence | A pushed branch can enter draft-PR convergence. |
| Convergence | `/submit-draft-pr` | Draft PR `## Convergence` section and any actionable issue remainder | Review and acceptance remain separate. |

Use the ordinary path for a small, clear fix. Neither path bypasses stops for
material ambiguity, credentials, destructive or authority-bound actions,
unrelated work, provider or head mismatch, or missing high-risk evidence.
OpenSpec references remain historical only.

GitHub-backed skills share the request policy in
[`standards/github-request-discipline.md`](standards/github-request-discipline.md).

## Skills

| Skill | Purpose |
|---|---|
| `/setup-repository` | Bootstrap a local project into the protected dod-guard GitHub workflow. |
| `/add-backlog-idea` | Capture each independently deliverable feature as a Backlog issue. |
| `/quick-pbi` | Run backlog capture through guarded merge without extra prompts outside refinement. |
| `/refine-backlog-item` | Deliberatively refine a Backlog issue, moving it to Todo only when its PBI is coherent and independently deliverable. |
| `/next-ticket` | Execute a Todo PBI through independent completion review and verified, pushed commits. |
| `/submit-draft-pr` | Create or update the PBI's verified draft pull request. |
| `/review-pr` | Review Git or GitHub inline with four agents, or produce one Azure DevOps report. |
| `/fix-pr-review` | Revalidate and fix selected GitHub, local Git, or Azure review findings. |
| `/complete-pr` | Complete an explicitly accepted draft through guarded auto-merge and branch deletion. |
| `/publish` | Release a changed marketplace plugin through merge, CI, and cache refresh. |
| `/clean-house` | Find and remove obsolete or duplicate implementations. |
| `/codex-advisor` | Get a bounded advice-only second opinion from a separate Codex process. |
| `/codex-migrate` | Adapt Claude-oriented repository instructions for Codex. |
| `/doc-reconcile` | Resolve contradictory documentation using Git history. |
| `/skill-debug` | Compare skill instructions with recorded executions. |
| `/skill-migrate` | Migrate agent instruction artifacts for current models. |

`review-pr-feature`, `review-pr-design`, `review-pr-reliability`, and
`review-pr-hygiene` provide the independent review angles. The coordinator
validates final-state lines and removes duplicate root causes before publishing
comments. The plugin has no MCP server or runtime bundle.
