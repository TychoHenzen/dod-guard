# dod-guard

A code-free plugin for GitHub issue delivery and focused repository
maintenance.

## Delivery workflow

`/add-backlog-idea` splits a brain dump into independently deliverable Backlog
issues. `/refine-backlog-item` turns one into a Todo PBI. `/next-ticket`
implements and pushes that PBI. `/submit-draft-pr` submits its verified draft
pull request. After review, `/complete-pr` treats its explicit invocation as
acceptance of the current head and completes the guarded merge. Each skill
resolves the current repository and requires exactly one open GitHub Project
explicitly linked to it.

One issue becomes one branch and one draft pull request:

```text
backlog idea -> Todo PBI -> codex/<issue>-<slug> -> verified commits -> draft PR -> accepted merge
```

The issue holds the requested outcome and acceptance sub-issues. The branch
holds implementation. The pull request holds the result and verification. A
human review followed by `/complete-pr` is the explicit acceptance boundary.

## Skills

| Skill | Purpose |
|---|---|
| `/add-backlog-idea` | Capture each independently deliverable feature as a Backlog issue. |
| `/refine-backlog-item` | Turn a Backlog issue into a Todo PBI and independent subtasks. |
| `/next-ticket` | Execute a Todo PBI through verified, pushed commits. |
| `/submit-draft-pr` | Create or update the PBI's verified draft pull request. |
| `/complete-pr` | Complete an explicitly accepted draft through guarded auto-merge and branch deletion. |
| `/publish` | Release a changed marketplace plugin through merge, CI, and cache refresh. |
| `/clean-house` | Find and remove obsolete or duplicate implementations. |
| `/codex-migrate` | Adapt Claude-oriented repository instructions for Codex. |
| `/doc-reconcile` | Resolve contradictory documentation using Git history. |
| `/skill-debug` | Compare skill instructions with recorded executions. |
| `/skill-migrate` | Migrate agent instruction artifacts for current models. |

The plugin has no MCP server or runtime bundle.
