# Evaluation Prompt — obsidian-rag

> Hand this whole file to a fresh evaluation agent. It is self-contained.
> Goal: prove `obsidian-rag` works as intended **and cannot corrupt the user's real
> Obsidian vault or the shared memory DB the session-start hook depends on.**

## Role & mission

You are a release-gate evaluator for `obsidian-rag`, an MCP server providing RAG/memory over
Obsidian vaults: semantic search, note CRUD, and cross-session memory (`memory_save` /
`memory_recall`). State lives in a SQLite DB (better-sqlite3) at **`~/.claude/obsidian-rag/`**
(overridable via `CLAUDE_PLUGIN_ROOT`), plus markdown written **into the selected vault
directory**. Your job: verify every tool's correctness and confirm the write/delete/reindex
paths cannot damage real user data. Report findings; fix nothing unless later told to.

Tools to cover (13): `vault_list`, `vault_select`, `index_status`, `reindex`, `list_notes`,
`read_note`, `search_notes`, `create_note`, `get_links`, `get_tags`, `memory_save`,
`memory_recall`, `memory_list`.

## 🔴 Non-negotiable safety rails

1. **Never point the evaluator at the user's real vault.** `create_note`, `reindex`, and
   `memory_save` write files. Build a **throwaway vault** in the OS temp dir
   (`%TEMP%\obsidian-eval-<rand>`) seeded with a handful of markdown notes with front-matter,
   tags, and `[[wikilinks]]`. All `vault_select` calls target only this sandbox vault.
2. **Isolate the DB.** The real DB at `~/.claude/obsidian-rag/` is loaded by the
   **session-start memory-injection hook** across all packages — corrupting it degrades every
   future session. Override the DB dir to a temp path (set `CLAUDE_PLUGIN_ROOT` to a temp dir,
   or construct the store with a temp `dbDir`) so the eval never touches the shared DB. Confirm
   the real DB's mtime is unchanged when you finish.
3. **Back up before touching anything shared.** If any test must exercise the real DB path,
   copy it first and restore after. Prefer full isolation over backup.
4. **No destructive op on real data.** `reindex` can rewrite index rows; never run it against
   the real vault/DB.
5. **Cleanup.** Delete the sandbox vault and temp DB dir when done; leave `~/.claude/` untouched.

## Orientation (read these first)

- `packages/obsidian-rag/CLAUDE.md` (+ the `obsidian-rag-architecture` memory) — components.
- `packages/obsidian-rag/src/store.ts` — SQLite: notes, chunks, embeddings, FTS5,
  `getLastVaultPath()`, DB path resolution (`CLAUDE_PLUGIN_ROOT || process.cwd()`, `dbDir`).
- `packages/obsidian-rag/src/vault.ts` — vault walk, note read/write, `memoryDir()`.
- `packages/obsidian-rag/src/indexer.ts` — heading-aware chunking.
- `packages/obsidian-rag/src/retriever.ts` — semantic + FTS search.
- `packages/obsidian-rag/src/index.ts` / `tools.ts` — MCP tool registrations + schemas.
- `packages/obsidian-rag/src/cli.ts` — CLI surface (also used by tooling).

## How to drive the tools

Prefer importing the compiled store/vault/tool functions directly with a temp `dbDir` +
sandbox vault (fully deterministic, embeddings may be stubbed if they require network — check
`indexer.ts`/`retriever.ts` for an embedding backend and note whether it needs an API key; if
so, mock it and record that semantic quality was not live-tested). Build first:
`npx tsc -p packages/obsidian-rag`. Use the MCP server (`node dist/bundle.js`) only to test the
registration/vault auto-select layer.

## Phase 1 — Static & unit baseline

1. `npm test -w packages/obsidian-rag`. Record pass/fail. Any failure = P0.
2. `npm run coverage -w packages/obsidian-rag`. Note uncovered branches — especially
   `store.ts` write/upsert/delete paths, `getLastVaultPath` auto-select, FTS query building.
3. Inspect the SQL: look for any query built via string interpolation of note content / paths
   (injection / FTS-syntax breakage). Flag interpolated SQL.

## Phase 2 — Functional matrix (sandbox vault + temp DB)

For each tool assert documented behavior with evidence:

1. `vault_list` → lists configured vaults; `vault_select` → sets active vault, persists as
   last-used (`getLastVaultPath`). Verify persistence survives a fresh store instance.
2. `index_status` before/after `reindex` → counts reflect the sandbox note set.
3. `reindex` → notes chunked + stored; re-running is idempotent (no duplicate chunks; changed
   note re-chunks, deleted note's chunks removed).
4. `list_notes` / `read_note` → returns seeded notes + content; missing path → clean error.
5. `search_notes` → returns relevant notes for a query present in the corpus; empty query and
   no-match handled. (If embeddings are mocked, test FTS/keyword path and say so.)
6. `get_links` → resolves `[[wikilinks]]` and backlinks; `get_tags` → aggregates front-matter +
   inline tags with counts.
7. `create_note` → writes markdown into the sandbox vault, then becomes searchable after index.
   Assert path traversal is impossible (see Phase 4).
8. **Memory (the cross-package contract):** `memory_save` writes to the vault's `memoryDir()`
   and the DB; `memory_recall` retrieves by relevance; `memory_list` enumerates. Critically:
   both `memory_save` and `memory_recall` must **auto-select the last vault** via
   `getLastVaultPath()` without an explicit `vault_select` first (friction #6/O1/S9). Test that
   path explicitly — call `memory_recall` in a fresh store with only a persisted last-vault.
9. `memory_save` **overwrite** of an existing id: assert the `overwrite` param works and warns,
   and that without it, re-saving the same id behaves as documented (friction #14).

## Phase 3 — Adversarial / failure injection

1. **No vault selected, no last-vault** → `memory_recall` / `search_notes` give a clean
   "select a vault" error, not a crash.
2. **Corrupt / partially-written note** (bad front-matter YAML, binary file with .md ext) →
   indexer skips or errors gracefully, does not abort the whole reindex.
3. **Huge note / many notes** → chunking + indexing complete without unbounded memory.
4. **Concurrent `reindex` + `search`** on the same DB → no SQLITE_BUSY crash / corruption
   (better-sqlite3 is sync; confirm locking assumptions hold).
5. **Vault path that doesn't exist / is a file / lacks permission** → clean error.
6. **DB file locked or read-only** → clean error, no data loss.
7. **Idempotency of memory_save**: saving the same content twice — duplicate rows? stale
   embeddings? Verify.

## Phase 4 — Safety audit (data integrity focus)

- **Path traversal**: can `create_note` / `read_note` / `memory_save` write or read outside the
  selected vault via `../`, absolute paths, or symlinks? Attempt `../../evil.md` and an absolute
  path; assert containment within the vault root.
- **SQL injection / FTS breakage**: note content or tags containing `'`, `"`, `);`, or FTS
  operators (`OR`, `NEAR`, `*`) must not break queries or leak/alter rows.
- **Shared-DB blast radius**: re-confirm the eval never wrote to `~/.claude/obsidian-rag/`
  (compare mtime + size before/after). This is the guarantee that matters most.
- **Data loss on reindex**: does `reindex` ever delete note *source files*, or only index rows?
  It must never touch the markdown itself. Prove it.
- **Front-matter / content preservation**: `create_note` round-trips content byte-for-byte
  (line endings included on Windows); no silent normalization that corrupts user notes.
- **Secret leakage**: memory bodies can contain secrets — confirm nothing is logged to stdout.

## Report format

1. **Verdict**: `SHIP` / `SHIP-WITH-FIXES` / `DO-NOT-SHIP` + one-line why.
2. **Tool matrix**: 13 rows — tool | verdict (PASS/WARN/FAIL) | evidence (command + observed).
3. **Findings**, severity-ranked (P0 data-loss/traversal/shared-DB-corruption / P1 correctness /
   P2 UX): what, repro, observed vs expected, proposed minimal fix (described, not applied).
4. **Isolation proof**: evidence the real vault + `~/.claude/obsidian-rag/` DB were untouched
   (mtime/size before & after).
5. **Coverage gaps** worth a test. Note whether semantic search was live or mocked.
6. **Cleanup**: sandbox vault + temp DB removed.

Report first. Implement nothing without go-ahead.
