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
| `index.ts` | MCP server entry: 13 tool registrations, error wrapping |
| `operations.ts` | All business logic: init, checkpoint, learn, spawn, abandon, adopt, finish |
| `operations.test.ts` | ~50 tests covering all operations + full integration flow |

### Workflow

```
evo_init → evo_checkpoint → evo_spawn → (work) → evo_learn → evo_checkpoint → (loop)
                                                    evo_abandon (dead end)
                                                    evo_adopt (winner) → evo_finish
```

### Key design decisions

- **Tag names**: evo-{name} for checkpoints, evo-dead-{branch} for abandoned, evo-root for root, evo-adopted for merged winners
- **Auto-stash dirty tree**: checkpoint, spawn, abandon, adopt all auto-stash before operating, pop after (stash left in place if pop fails)
- **Pre-flight safety checks**: `evo_spawn` and `evo_abandon` scan for untracked source files, stale dist/*.js, and files in HEAD not in target ref before destructive operations. Refuse with diagnostic unless `force=true`.
- **Re-running init**: clears lessons.jsonl, re-tags evo-root (idempotent)
- **Lesson export**: `evo_export_lessons` outputs obsidian-rag memory_save compatible JSON
- **Error handling**: `EvoError` for user-facing errors (init not run, wrong state). Extends Error for clean instanceof checks.
- **`gitOrNull`**: swallows EvoError, returns null — used for optional queries like tag listing
