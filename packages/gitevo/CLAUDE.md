# CLAUDE.md — gitevo

## Build & Test

```bash
npx tsc                          # compile TypeScript to dist/
npx tsc --watch                  # dev mode
npx tsc && node --test "dist/*.test.js"  # run tests
npm run bundle                   # esbuild bundle for distribution
```

## Architecture

gitevo is a lightweight MCP server providing evolutionary git branching for LLM agents. All state lives in `.evo/` directory (SQLite memory bus + lessons.jsonl for legacy migration). Git runs through `spawnSync` with an argv array, never through a shell, so nothing has to escape anything.

### Files

| File | Role |
|------|------|
| `index.ts` | MCP server entry: 15 tool registrations (incl. evo_memory_query, evo_memory_stats), error wrapping |
| `operations.ts` | init, checkpoint, spawn, abandon, adopt, finish, and the listing operations. Re-exports the whole boundary, because both callers import `dist/operations.js`. Memory bus writes on checkpoints and branches. SQLite is the single source of truth (JSONL only created for legacy migration). |
| `evo-error.ts` | `EvoError` alone |
| `evo-config.ts` | `EvoConfig` and `loadConfig` |
| `evo-git.ts` | The git process and where the repository lives: root resolution, the init guard, status, branch and tag reads, set-aside and restore |
| `evo-safety.ts` | What a destructive move would cost, worked out before the move happens |
| `evo-lessons.ts` | `evo_learn`, `evo_lessons`, `evo_export_lessons`, and the lesson read used by the rest |
| `operations.test.ts` | ~57 tests covering all operations + full integration flow. Each of the files above has its own suite beside it. |
| `memory.ts` | SQLite memory bus (better-sqlite3): INSIGHT, FAILURE_SIGNATURE, ELITE_SOLUTION message types. Query by type/scope, countMessages, branch upsert, checkpoint timestamps, spawn-point lookup. WAL mode. |

### Tools

| Tool | Purpose |
|------|---------|
| `evo_init` | Initialize .evo/ directory and root checkpoint |
| `evo_checkpoint` | Tag HEAD as checkpoint |
| `evo_spawn` | Branch from checkpoint for exploration |
| `evo_learn` | Record lesson in SQLite memory bus (INSIGHT type) |
| `evo_abandon` | Tag branch dead, revert to spawn checkpoint (or explicit ref) |
| `evo_adopt` | Merge winning branch to root |
| `evo_finish` | Final cleanup: merge, delete tags, remove .evo/ |
| `evo_branches` | List attempt branches |
| `evo_checkpoints` | List evo-* tags |
| `evo_diff` | Diff between checkpoints |
| `evo_summary` | Overview: active branch, counts |
| `evo_lessons` | List lessons from SQLite memory bus |
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
- **WIP checkpoints**: `evo_checkpoint` with dirty tree creates a WIP commit, tags it, then resets back to the captured HEAD. That restores the dirty state and captures uncommitted work. Clean tree tags HEAD directly. Spawn branches from the captured state.
- **Auto-stash dirty tree**: spawn and abandon stash before operating. Spawn pops after and reports a failed pop. Abandon leaves the stash in place, because restoring dirty edits on top of a rewind contradicts the rewind. A stash that will not run throws, so the destructive move never happens without it. adopt throws on dirty tree.
- **Safety evaluation**: `evo_spawn` and `evo_abandon` scan for untracked source files, stale build output, and files in HEAD not in the target ref. Build output is reported by its own finding, never by the other two. Configurable via `.evo/config.json` (EvoConfig: sourceExtensions, buildLayouts, skipStaleCheck). `.test.js` not flagged stale in JS-only repos. Refuse with diagnostic unless `force=true`.
- **Ignoring `.evo/`**: written to `info/exclude` under the common git dir, not to `.gitignore`, so the working tree stays clean and no WIP checkpoint ever commits `memory.db`.
- **Record store failures never break git**: every memory bus call runs after the git effect it describes. A store that will not answer is swallowed.
- **Re-running init**: migrates legacy JSONL → SQLite, clears JSONL, re-tags evo-root. SQLite lessons survive re-init (no data loss). Idempotent.
- **Lesson export**: `evo_export_lessons` reads from SQLite memory bus, outputs obsidian-rag memory_save compatible JSON with SHA-256-based IDs (idempotent re-export). Single source of truth: SQLite.
- **Branch upsert**: `recordBranch` uses ON CONFLICT(name) DO UPDATE — one row per branch with current status. `evo_abandon` defaults revert target to `spawned_from` checkpoint (read from branches table), not HEAD~1.
- **Merge conflict handling**: `evo_adopt` detects conflicts, runs `git merge --abort`, throws actionable EvoError with file list. `evo_finish` surfaces internal adopt failures cleanly.
- **Error handling**: `EvoError` for user-facing errors (init not run, wrong state). Extends Error for clean instanceof checks.
- **`gitTry`**: swallows EvoError, returns null. Used for optional queries like tag listing
