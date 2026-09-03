# dod-guard

A code-free plugin for GitHub issue delivery and focused repository
maintenance.

## Delivery workflow

`/next-ticket` resolves the repository from the current checkout. It requires
exactly one open GitHub Project explicitly linked to that repository.

One issue becomes one branch and one draft pull request:

```text
GitHub issue -> codex/<issue>-<slug> -> verified commits -> draft PR
```

The issue holds the requested outcome and acceptance sub-issues. The branch
holds implementation. The pull request holds the result and verification.
Merging and approval remain human actions.

## Skills

| Skill | Purpose |
|---|---|
| `/next-ticket` | Deliver a linked Project issue through a verified draft PR. |
| `/clean-house` | Find and remove obsolete or duplicate implementations. |
| `/codex-migrate` | Adapt Claude-oriented repository instructions for Codex. |
| `/doc-reconcile` | Resolve contradictory documentation using Git history. |
| `/skill-debug` | Compare skill instructions with recorded executions. |
| `/skill-migrate` | Migrate agent instruction artifacts for current models. |

The plugin has no MCP server or runtime bundle.
