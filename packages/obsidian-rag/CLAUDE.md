# obsidian-rag — RAG/Memory MCP for Obsidian Vaults

## Build & Test

```bash
cd packages/obsidian-rag
tsc                    # compile TypeScript to dist/
npm test               # full tsc rebuild + run all tests
npm run bundle         # esbuild bundle for distribution (prepublish)
```

## Architecture

**obsidian-rag** is an MCP server that provides RAG (Retrieval Augmented Generation) on top of an Obsidian vault. It supports semantic search, note CRUD, memory recall, backlink traversal, and tag aggregation — all local, all offline.

### Key components

| File | Role |
|------|------|
| `src/index.ts` | MCP server entry point: tool registration, resource handlers, server lifecycle. Lazy-loads embedder (Xenova MiniLM), true batched embedding |
| `src/types.ts` | All TypeScript types: `VaultInfo`, `NoteMeta`, `NoteContent`, `Chunk`, `SearchResult`, `MemoryEntry` |
| `src/store.ts` | SQLite (better-sqlite3) persistence: notes, chunks, BLOB embeddings, FTS5 keyword index. `sanitizeQuery` strips FTS5-special chars; `searchNotesFTS` falls back to LIKE on syntax error. `getChunksWithEmbeddings` reads Float32Array BLOBs (no JSON.parse). `isVecAvailable` placeholder for future ANN. No runtime `npm install` — fails fast with instructions |
| `src/indexer.ts` | Markdown chunking: heading-aware section splitting, content hashing, incremental indexing, stale-chunk deletion, ghost-note reconciliation. `indexNote()` for single-note reindex (used by `create_note`/`memory_save`). Embeddings generated during normal indexing (not just `reindex embed:true`) |
| `src/retriever.ts` | Search: keyword (FTS5), semantic (cosine similarity on Float32Array BLOBs), hybrid merge (40/60 keyword/semantic weights). `embedAllChunks()` for background embedding with progress. Fast-path skips embedder load when no embeddings exist |
| `src/vault.ts` | Filesystem operations: read/write notes, frontmatter parsing (gray-matter), wikilink extraction, backlink resolution. Path containment uses `realpathSync` |
| `src/cli.ts` | Obsidian CLI wrapper: used ONLY for vault discovery (`vault_list`). NOT used for content reads (see Single Source of Truth below) |

### Single Source of Truth

SQLite index + filesystem is the authoritative backend for all read operations (`read_note`, `list_notes`, `get_links`, `get_tags`, `search_notes`). The Obsidian CLI is used **only** for vault discovery (`vault_list`). Read tools never auto-select or full-index a vault — if no vault is selected, they return a clear error. Errors are surfaced directly (no bare `catch {}`).

### Data flow

1. **Vault selection** (`vault_select`) → calls Obsidian CLI for vault list, or accepts direct path. Runs full `indexVault` with embeddings generated during indexing (not a separate step)
2. **Indexing** (`indexVault`) → walks all .md files, chunks each into heading-aware sections (~800 chars, 100 char overlap), stores in SQLite with FTS5. Per-note: deletes old chunks first, then inserts fresh (handles shrinking notes). Reconciliation pass drops notes whose files no longer exist on disk
3. **Single-note reindex** (`indexNote`) → used by `create_note` and `memory_save` after writes; clears old chunks, upserts, chunks, and embeds the single note. Makes writes immediately searchable
4. **Search** (`search_notes`) → hybrid: FTS5 keyword (BM25) + optional cosine similarity on Float32Array BLOBs (no JSON.parse), scored and merged (40/60 keyword/semantic weights). Fast-path skips embedder load when `embeddedChunks=0`
5. **Memory** (`memory_save`/`memory_recall`) → `memory_recall` uses same FTS5+semantic stack as `search_notes`, scoped to `Claude-Memories/` path prefix. `memory_save` auto-indexes via `indexNote` after write. Memories are markdown files in `.claude-memories/` directory with Claude Code-compatible frontmatter format

### Chunking strategy

Markdown is split by headings (`# ` through `###### `) preserving heading breadcrumbs. Code blocks stay intact. Chunks are ~800 characters with ~100 character overlap between adjacent chunks. Each chunk gets a stable ID (`{notePath}#{chunkIndex}`).

### Search modes

| Mode | Engine | Requirements |
|------|--------|--------------|
| `keyword` | SQLite FTS5 (BM25) with LIKE fallback on syntax errors | Always available |
| `semantic` | Cosine similarity on Float32Array BLOBs (MiniLM-L6-v2) | `@xenova/transformers` (optional) |
| `hybrid` | Merged keyword + semantic (40/60 weights). Fast-path skips embedder when no embeddings exist | @xenova/transformers for semantic component |

### Obsidian CLI dependency

The `obsidian` CLI is used **only** for vault discovery (`vault_list`). It's optional — if not available, users pass the vault path directly. The CLI wrapper (`cli.ts`) handles both cases gracefully. Content reads, search, tags, links, and listings all use SQLite + filesystem directly (no CLI dependency).

### MCP tools

| Tool | Purpose |
|------|---------|
| `vault_list` | List all known Obsidian vaults (CLI — only tool that uses CLI) |
| `vault_select` | Select a vault by name or path. Runs full index with embeddings |
| `search_notes` | Hybrid search across all notes (FTS5 + optional semantic on BLOBs) |
| `read_note` | Read full note content from filesystem (not CLI) |
| `list_notes` | List notes from SQLite index, optionally filtered by directory |
| `get_links` | Forward links + backlinks for a note (filesystem + SQLite) |
| `get_tags` | All tags with note counts from SQLite index |
| `index_status` | Check indexing progress (includes embedding progress) |
| `reindex` | Force full reindex. `embed:true` starts background embedding, returns immediately |
| `memory_save` | Save structured memory entry + auto-index via `indexNote` |
| `memory_recall` | FTS5+semantic search over saved memories (same stack as `search_notes`) |
| `memory_list` | List all memories from filesystem |
| `create_note` | Create or update notes + auto-index via `indexNote` |

### MCP resources

| Resource | URI | Description |
|----------|-----|-------------|
| Vault List | `obsidian://vaults` | Known vaults |
| Tag List | `obsidian://tags` | Tags with counts |
| Note Content | `obsidian://notes/{path}` | Raw note by path |

### Embedding support

Optional semantic search via `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2`. Embeddings are stored as Float32Array BLOBs in SQLite (`embedding_blob` column) alongside the legacy JSON text column. Cosine similarity reads BLOBs directly — no per-query `JSON.parse`.

- **Normal indexing**: `indexVault` generates embeddings during indexing (no separate `reindex embed:true` required). Embedder passed as optional `Embedder | null` parameter; gracefully skips if unavailable
- **Background embedding**: `reindex embed:true` fires `embedAllChunks()` asynchronously and returns immediately with a progress handle. `index_status` shows real-time progress. No MCP timeout risk on large vaults
- **True batching**: `embedBatch` passes all texts to the transformer pipeline at once (not one-at-a-time)
- **Fast-path**: `hybridSearch`/`semanticSearch` skip embedder load entirely when `embeddedChunks=0`
- **Dimension mismatch**: `cosineSimilarity` throws a clear error (not silent 0) if query and stored embedding dimensions differ

Install with:

```bash
npm install @xenova/transformers
```

Without it, only keyword search (FTS5) is available — still very usable.
