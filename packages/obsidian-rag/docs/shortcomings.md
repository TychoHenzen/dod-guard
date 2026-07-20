# obsidian-rag — Top 10 Shortcomings

Investigation of `packages/obsidian-rag/src/` (~3.4k LOC). Findings are ranked by
user impact, most severe first. Line references are to the source at the time of
writing.

---

## 1. `memory_recall` is not semantic at all — it's substring matching

**Where:** `tools.ts:386-424`

The tool is documented as *"Search through saved memories using hybrid search"*,
but the implementation is a naive `String.toLowerCase().includes()` word-overlap
scorer:

```ts
if (m.title.toLowerCase().includes(queryLower)) score += 3;
for (const word of queryLower.split(/\s+/)) {
  if (word.length < 3) continue;
  if (m.content.toLowerCase().includes(word)) score += 1;
}
```

No embeddings, no FTS5, no stemming, no fuzzy matching. A recall for "authentication
bug" will miss a memory titled "login token expiry" entirely. The description
actively misrepresents the behavior. On top of that it **re-reads every memory file
from disk on every call** (`readMemories` walks the whole `Claude-Memories/` tree and
`readFile`s each `.md`), so recall is O(files × disk I/O) with zero caching and never
touches the SQLite index it already maintains.

---

## 2. Embeddings are never generated during indexing → "hybrid" silently degrades to keyword-only

**Where:** `indexer.ts:130-179`, `tools.ts:108`, `index.ts:78-79`

`embedChunks()` is only ever called from the `reindex` tool when the caller passes
`embed: true` (`tools.ts:305`). Normal indexing (`indexVault`, invoked by
`vault_select` and the auto-select path) stores chunks with `embedding = NULL` and
never embeds them.

Consequence: on any freshly indexed vault, `semanticSearch` filters to
`withEmbeddings` (`retriever.ts:36`), finds none, and returns `[]`. `hybridSearch`
then returns keyword results only — while still paying to **load the entire MiniLM
transformer model** via `getEmbedder()` for nothing (`tools.ts:160`). The default
`kind: "hybrid"` search advertises semantic ranking that is effectively off unless the
user happens to know they must run `reindex embed:true` first.

---

## 3. Incremental indexing never deletes stale notes or orphaned chunks

**Where:** `indexer.ts:137-165`, `store.ts:311-324`

`indexVault` only ever **upserts**. Two correctness bugs follow:

- **Deleted notes persist forever.** A note removed from disk stays in `notes`,
  `notes_fts`, and `chunks` until someone runs a full `reindex` (which does
  `clearNotes` + `clearChunks`). Search keeps returning ghosts.
- **Shrunk notes leak chunks.** Chunk IDs are `${notePath}#${index}`. If a note that
  produced 5 chunks is edited down to 2, chunks `#2`–`#4` are never deleted — the note
  is re-upserted but old chunks are not cleared first. These orphans still match
  semantic queries and point at content that no longer exists.

The incremental path needs a "delete existing chunks for this note before re-inserting"
step and a reconciliation pass for files present in the index but absent on disk.

---

## 4. Semantic search is a full-table O(N) scan with per-query JSON deserialization

**Where:** `retriever.ts:35-57`

Every semantic query calls `store.getChunks(vaultName)` — pulling **all** chunks for
the vault into memory — then `JSON.parse`s each embedding string and computes cosine
similarity in JS:

```ts
const chunks = store.getChunks(vaultName);
const withEmbeddings = chunks.filter((c) => c.embedding && c.embedding.length > 0);
const scored = withEmbeddings.map((chunk) => { /* JSON.parse + cosine */ });
```

There is no ANN index (HNSW/IVF), no vector column, no `sqlite-vec`/`sqlite-vss`, not
even a persisted `Float32Array` — embeddings are stored as JSON text and re-parsed on
every search. This is fine for a toy vault and falls over at a few thousand chunks,
turning each search into multi-hundred-millisecond CPU work plus large allocations.

---

## 5. `create_note` and other writes never update the search index (index desync)

**Where:** `tools.ts:451-515`, `cli.ts:142-151`, `vault.ts:73-84`

`create_note` writes through the Obsidian CLI (or falls back to `writeNote` on the
filesystem) but **never reindexes** the note it just wrote. The new/edited note is
therefore invisible to `search_notes` until the user manually runs `reindex`. The tool
reports `✅ Created note` with no hint that it won't be findable. Same class of problem
applies to any external edit to the vault between indexing runs.

---

## 6. Dual CLI / filesystem code paths with no single source of truth

**Where:** `tools.ts` (read_note, list_notes, get_links, get_tags, create_note),
`cli.ts`, `index.ts`

Nearly every tool tries the Obsidian CLI first and silently falls back to the FS/SQLite
path in a bare `catch {}`. As a result different tools answer from different backends:

- `search_notes` reads the **SQLite index**.
- `read_note` reads via the **CLI** (`cliReadNote`), bypassing the index entirely.
- `list_notes` / `get_tags` prefer the **CLI**, fall back to the **store**.

So a note can rank in search but 404 in `read_note` (or vice versa), and tag/list
counts can disagree depending on whether Obsidian happens to be running. The silent
`catch {}` fallbacks also swallow real CLI errors (e.g. malformed output) and mask them
as "not found."

---

## 7. Read-only tools have side effects: auto-select + synchronous full index

**Where:** `index.ts:52-109`

`waitForVault()` — called by every read tool — will, if no vault is selected,
**auto-pick a vault** (prefers one literally named "claude", else the first in the
list) and then run a **full synchronous `indexVault`** inside the triggering tool call:

```ts
const claudeVault = vaults.find((v) => v.name.toLowerCase() === "claude");
const vault = claudeVault ?? vaults[0];
...
await indexVault(vault.path, vault.name, store);
```

A user calling `search_notes` can thus silently index an unrelated vault they never
selected, blocking the call for the entire walk. The surrounding logic is also
convoluted: a 5-second, 50-iteration polling loop with redundant `if (!selectedVault)`
guards and nested try/catch that make the control flow hard to reason about.

---

## 8. `reindex embed:true` blocks the tool call and "batches" one item at a time

**Where:** `tools.ts:299-311`, `retriever.ts:120-136`, `index.ts:124-128`

Re-embedding runs a blocking loop inside the MCP handler:

```ts
do { batchCount = await embedChunks(store, vault.name, emb); } while (batchCount > 0);
```

`embedChunks` claims `batchSize = 32`, but `embedBatch` just loops `embed` one text at
a time (`index.ts:124-128`) — there is no real batching, so no throughput benefit.
For a large vault this can run for minutes with no progress reporting and will
routinely exceed the MCP request timeout, leaving embeddings half-populated. Embedding
belongs in a background job with checkpointing, not in the request path.

---

## 9. `sanitizeQuery` doesn't do what its own comments claim → FTS5 syntax errors leak

**Where:** `store.ts:49-65`

The function documents stripping bare wildcards *and* "remove unbalanced parentheses
that can break grouping," but the code only strips a leading `*`:

```ts
// ... and remove unbalanced parentheses that can break grouping
sanitized = sanitized.replace(/(?:^|\s)\*(?=\S)/g, " "); // leading * not attached to word
return sanitized;
```

Parentheses are never touched, column-filter syntax (`col:term`) isn't escaped, and
`NEAR`/`AND`/`OR`/`NOT` handling is partial. A user query containing `(`, `)`, `:` or a
stray `"` can still produce an FTS5 syntax error that propagates as an unhandled
exception, failing the whole `search_notes` call instead of degrading gracefully.

---

## 10. Native dependency is installed lazily via `execSync("npm install")` inside the server

**Where:** `store.ts:17-44`

On the first DB access, if `better-sqlite3` is missing, the server shells out and runs a
full `npm install` synchronously, blocking for up to 60 seconds inside the plugin cache
directory:

```ts
execSync("npm install --omit=dev --no-audit --no-fund", { cwd: pluginRoot, timeout: 60000 });
```

This couples correct operation to network access at runtime, blocks the event loop for
a minute, can trigger unexpected postinstall/native-compile steps, and writes into a
directory the server doesn't own. A missing native dep should fail fast with clear
install instructions, or be handled at plugin install time — not auto-installed from
inside a request.

---

## Honorable mentions (real, lower impact)

- **Silent zero on embedding dimension mismatch** (`retriever.ts:140-141`): if the
  embedding model ever changes, `cosineSimilarity` returns `0` for every mismatched
  vector, so semantic search silently returns nothing with no error surfaced.
- **Path-traversal guard comment is wrong** (`vault.ts:13-25`): the comment claims
  `resolve()` "handles symlinks," but `resolve()` does not resolve symlinks (that's
  `realpath`). A symlink inside the vault pointing outside would not be caught.
- **FTS5 indexes tags as raw JSON** (`store.ts:127-150`): the `tags` column is fed the
  literal `["a","b"]` JSON string, so keyword search over tags is polluted by brackets
  and quotes and can't cleanly match a tag token.
- **Dead parameter** (`tools.ts:31`): `getVault` is destructured as `_getVault` and
  never used.
- **`embedBatch` is fake batching** (`index.ts:124-128`): sequential per-item calls
  despite the batched signature — no perf benefit, misleading API.
