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
| `src/index.ts` | MCP server entry point: tool registration, resource handlers, server lifecycle |
| `src/types.ts` | All TypeScript types: `VaultInfo`, `NoteMeta`, `NoteContent`, `Chunk`, `SearchResult`, `MemoryEntry` |
| `src/store.ts` | SQLite (better-sqlite3) persistence: notes, chunks, embeddings, FTS5 keyword index |
| `src/indexer.ts` | Markdown chunking: heading-aware section splitting, content hashing, incremental indexing |
| `src/retriever.ts` | Search: keyword (FTS5), semantic (cosine similarity on embeddings), hybrid merge |
| `src/vault.ts` | Filesystem operations: read/write notes, frontmatter parsing (gray-matter), wikilink extraction, backlink resolution |
| `src/cli.ts` | Obsidian CLI wrapper: vault discovery (`obsidian vaults`), vault info, search fallback |

### Data flow

1. **Vault selection** (`vault_select`) → calls Obsidian CLI for vault list, or accepts direct path
2. **Indexing** (`indexVault`) → walks all .md files, chunks each into heading-aware sections (~800 chars, 100 char overlap), stores in SQLite with FTS5 keyword index
3. **Search** (`search_notes`) → hybrid: FTS5 keyword (BM25) + optional cosine similarity on embeddings, scored and merged
4. **Memory** (`memory_save`/`memory_recall`) → read/write `.claude-memories/` directory with Claude Code-compatible frontmatter format

### Chunking strategy

Markdown is split by headings (`# ` through `###### `) preserving heading breadcrumbs. Code blocks stay intact. Chunks are ~800 characters with ~100 character overlap between adjacent chunks. Each chunk gets a stable ID (`{notePath}#{chunkIndex}`).

### Search modes

| Mode | Engine | Requirements |
|------|--------|--------------|
| `keyword` | SQLite FTS5 (BM25) | Always available |
| `semantic` | Cosine similarity on MiniLM-L6-v2 embeddings | `@xenova/transformers` (optional) |
| `hybrid` | Merged keyword + semantic (40/60 weights) | @xenova/transformers for semantic component |

### Obsidian CLI dependency

The `obsidian` CLI is used for vault discovery. It's optional — if not available, users pass the vault path directly. The CLI wrapper (`cli.ts`) handles both cases gracefully.

### MCP tools

| Tool | Purpose |
|------|---------|
| `vault_list` | List all known Obsidian vaults (CLI) |
| `vault_select` | Select a vault by name or path |
| `search_notes` | Hybrid search across all notes |
| `read_note` | Read full note content |
| `list_notes` | List notes, optionally filtered by directory |
| `get_links` | Forward links + backlinks for a note |
| `get_tags` | All tags with note counts |
| `index_status` | Check indexing progress |
| `reindex` | Force full reindex, optionally re-embed |
| `memory_save` | Save structured memory entry |
| `memory_recall` | Semantic recall over saved memories |
| `memory_list` | List all memories by type |
| `create_note` | Create or update notes |

### MCP resources

| Resource | URI | Description |
|----------|-----|-------------|
| Vault List | `obsidian://vaults` | Known vaults |
| Tag List | `obsidian://tags` | Tags with counts |
| Note Content | `obsidian://notes/{path}` | Raw note by path |

### Embedding support

Optional semantic search via `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2`. Embeddings are cached in SQLite. `embedChunks()` processes unembedded chunks in batches of 32. Install with:

```bash
npm install @xenova/transformers
```

Without it, only keyword search (FTS5) is available — still very usable.
