# Tool evaluation prompts

Self-contained release-gate evaluation prompts for the three least-mature MCP packages.
Each file is written to be handed to a **fresh agent** cold — it carries its own safety
rails, orientation, test matrix, and report format.

| Prompt | Package | Primary hazard the eval guards against |
|--------|---------|----------------------------------------|
| [`gitevo-eval.md`](gitevo-eval.md) | `packages/gitevo` | Silent git data loss (stash/checkout/reset/tag-delete on `process.cwd()`'s repo) |
| [`evomcp-eval.md`](evomcp-eval.md) | `packages/evomcp` | Cost, runaway `claude -p` subprocesses, arbitrary `verify_cmd`/`fitness_cmd` execution |
| [`obsidian-rag-eval.md`](obsidian-rag-eval.md) | `packages/obsidian-rag` | Corrupting the real Obsidian vault or the shared `~/.claude/obsidian-rag/` memory DB |

## How to run one

Dispatch to a fresh worker with the prompt as its task, e.g.:

```
Agent(subagent_type="general-purpose",
      description="Evaluate gitevo",
      prompt="<paste contents of docs/eval-prompts/gitevo-eval.md>")
```

Notes:
- **No git worktrees.** Isolation comes entirely from each prompt's own **throwaway
  temp-dir sandbox** — a fresh `git init` repo (gitevo), a temp vault + temp DB dir
  (obsidian-rag), a temp cwd (evomcp). The evaluator operates only inside that sandbox and
  never mutates the primary checkout. Do not add worktree isolation.
- Each prompt ends in **report-only** mode: findings first, no fixes/publish without a
  follow-up go-ahead. Review the report, then decide what to patch.
- `evomcp-eval.md` has a **gated live phase** that costs real API money and needs the
  deepclaude proxy on `127.0.0.1:3200` — it will stop and ask before any paid run.

## Shared shape

All three follow: 🔴 safety rails → orientation → Phase 1 static/unit baseline →
Phase 2 functional matrix (isolated) → Phase 3 adversarial/failure injection →
Phase 4 safety audit → structured verdict report.
