# CLAUDE.md — gitevo

## Build & Test

```bash
npx tsc                          # compile TypeScript to dist/
npx tsc --watch                  # dev mode
npx tsc && node --test "dist/*.test.js"  # run tests
npm run bundle                   # esbuild bundle for distribution
```

## Architecture

gitevo is a lightweight MCP server providing evolutionary git branching for LLM agents. All state lives in `.evo/` directory, all git ops use `execSync`.

### Files

| File | Role |
|------|------|
| `index.ts` | MCP server entry: 15 tool registrations (incl. evo_memory_query, evo_memory_stats), error wrapping |
| `operations.ts` | All business logic: init, checkpoint, learn, spawn, abandon, adopt, finish. Memory bus writes on checkpoints/lessons. |
| `operations.test.ts` | ~50 tests covering all operations + full integration flow |
| `memory.ts` | SQLite memory bus (better-sqlite3): INSIGHT, FAILURE_SIGNATURE, ELITE_SOLUTION message types. Query by type/scope. Stats aggregation. |

### Tools

| Tool | Purpose |
|------|---------|
| `evo_init` | Initialize .evo/ directory and root checkpoint |
| `evo_checkpoint` | Tag HEAD as checkpoint |
| `evo_spawn` | Branch from checkpoint for exploration |
| `evo_learn` | Record lesson in .evo/lessons.jsonl |
| `evo_abandon` | Tag branch dead, revert to checkpoint |
| `evo_adopt` | Merge winning branch to root |
| `evo_finish` | Final cleanup: merge, delete tags, remove .evo/ |
| `evo_branches` | List attempt branches |
| `evo_checkpoints` | List evo-* tags |
| `evo_diff` | Diff between checkpoints |
| `evo_summary` | Overview: active branch, counts |
| `evo_lessons` | List lessons from .evo/lessons.jsonl |
| `evo_export_lessons` | Export lessons as obsidian-rag JSON |
| `evo_memory_query` | Query SQLite memory bus by type/scope |
| `evo_memory_stats` | Memory bus statistics by type |

### Memory bus

SQLite database at `.evo/memory.db` with three message types:
- `INSIGHT` — design decisions, patterns discovered
- `FAILURE_SIGNATURE` — approach that didn't work, with diagnostics
- `ELITE_SOLUTION` — winning solution snapshot for cross-session learning

evomcp reads the memory bus via `gitevo-integration.ts` to seed strategy prompts with past failures and elites.

```
evo_init → evo_checkpoint → evo_spawn → (work) → evo_learn → evo_checkpoint → (loop)
                                                    evo_abandon (dead end)
                                                    evo_adopt (winner) → evo_finish
```

### Key design decisions

- **Tag names**: evo-{name} for checkpoints, evo-dead-{branch} for abandoned, evo-root for root, evo-adopted for merged winners
- **Auto-stash dirty tree**: checkpoint, spawn, abandon all auto-stash before operating, pop after (stash left in place if pop fails). adopt throws on dirty tree.
- **Pre-flight safety checks**: `evo_spawn` and `evo_abandon` scan for untracked source files, stale dist/*.js, and files in HEAD not in target ref before destructive operations. Refuse with diagnostic unless `force=true`.
- **Re-running init**: clears lessons.jsonl, re-tags evo-root (idempotent)
- **Lesson export**: `evo_export_lessons` outputs obsidian-rag memory_save compatible JSON
- **Error handling**: `EvoError` for user-facing errors (init not run, wrong state). Extends Error for clean instanceof checks.
- **`gitOrNull`**: swallows EvoError, returns null — used for optional queries like tag listing
