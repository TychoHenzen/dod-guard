# obsidian-rag — Fix Plan

Derived from `shortcomings.md` (investigation of ~3.4k LOC). Each step is atomic enough for a single `/step-by-step` subagent. Steps ordered so the indexing/embedding foundation is fixed before the search layers that depend on it.

Root themes: (a) "semantic"/"hybrid" search is effectively off — embeddings are never generated during normal indexing and `memory_recall` is plain substring matching; (b) incremental indexing never deletes, so search returns ghosts; (c) writes don't reindex → desync; (d) dual CLI/FS paths with silent `catch {}` disagree; (e) a runtime `npm install` blocks the event loop.

---

## Step 1 — Generate embeddings during normal indexing (#2) — FOUNDATION

**Problem:** `embedChunks()` is only called from `reindex` when `embed: true` (tools.ts:305). Normal `indexVault` (via `vault_select`/auto-select) stores chunks with `embedding = NULL` (indexer.ts:130-179). So `semanticSearch` filters to `withEmbeddings` (retriever.ts:36), finds none, returns `[]`; `hybrid` degrades to keyword-only while still loading the MiniLM model for nothing (tools.ts:160).

**Change:**
- Embed chunks as part of `indexVault` (either inline for small vaults or by enqueuing a background embed job — see Step 8). At minimum, newly indexed/changed chunks get embeddings without a separate `reindex embed:true`.
- Don't load the embedder at search time if there are no embeddings to compare against; only pay the model-load cost when embeddings exist.

**Verify:** fresh `vault_select` then a `hybrid` search returns semantically-ranked results (not keyword-only); chunks have non-NULL embeddings. Test.

**Files:** `indexer.ts`, `tools.ts`, `index.ts`, `retriever.ts`.

---

## Step 2 — Incremental indexing deletes stale notes and orphaned chunks (#3)

**Problem:** `indexVault` only upserts (indexer.ts:137-165, store.ts:311-324). Deleted notes persist in `notes`/`notes_fts`/`chunks` forever; a note shrunk from 5 chunks to 2 leaks chunks `#2`–`#4` (ids are `${notePath}#${index}`). Ghosts keep matching.

**Change:**
- Before re-inserting a note's chunks, delete all existing chunks for that note path (clear-then-insert per note).
- Add a reconciliation pass: enumerate notes in the index, drop any whose file is absent on disk (from `notes`, `notes_fts`, `chunks`).

**Verify:** delete a note on disk + reindex → it's gone from search; shrink a note → old high-index chunks removed. Tests.

**Files:** `indexer.ts`, `store.ts`.

---

## Step 3 — `memory_recall` uses the real index, not substring matching (#1)

**Problem:** `memory_recall` (tools.ts:386-424) is documented as hybrid search but is `toLowerCase().includes()` word-overlap scoring — no embeddings, FTS5, stemming, or fuzzy match; a recall for "authentication bug" misses "login token expiry." It also re-reads every memory `.md` from disk on every call with zero caching, never touching the SQLite index.

**Change:**
- Route `memory_recall` through the same retrieval stack as `search_notes` (FTS5 + semantic on embeddings from Step 1), scoped to the memories collection.
- Index memory files into SQLite (like vault notes) so recall reads the index, not the disk tree, on each call.

**Verify:** recall for "authentication bug" surfaces a memory titled "login token expiry"; recall does not walk the memories directory on every call (assert via a spy/fixture). Tests.

**Files:** `tools.ts`, `store.ts`, `indexer.ts`, `retriever.ts`.

**Depends on Step 1.**

---

## Step 4 — Reindex on writes (#5)

**Problem:** `create_note` (tools.ts:451-515) writes via CLI or `writeNote` fallback but never reindexes — the new/edited note is invisible to `search_notes` until a manual `reindex`. Reports `✅ Created note` with no hint. Same for external edits between runs.

**Change:**
- After any write (`create_note` and any other mutating tool), incrementally index just that note (reuse the per-note index path from Step 2, including embedding from Step 1).
- Optionally add a lightweight staleness check (mtime/hash) so external edits are picked up on next read.

**Verify:** `create_note` then immediately `search_notes` finds it without a manual reindex. Test.

**Files:** `tools.ts`, `cli.ts`, `vault.ts`, `indexer.ts`.

**Depends on Steps 1–2.**

---

## Step 5 — Single source of truth for reads (kill dual CLI/FS split-brain) (#6)

**Problem:** nearly every tool tries the Obsidian CLI first and silently falls back to FS/SQLite in a bare `catch {}` (tools.ts, cli.ts, index.ts). `search_notes` reads SQLite, `read_note` reads via CLI (bypassing the index), `list_notes`/`get_tags` prefer CLI. A note can rank in search but 404 in `read_note`; tag/list counts disagree. Silent `catch {}` masks real CLI errors as "not found."

**Change:**
- Make the SQLite index (+ filesystem for raw content) the single authoritative backend for `read_note`, `list_notes`, `get_links`, `get_tags`, `search_notes`. Use the CLI only for vault *discovery* (its unique capability), not for content reads.
- Remove the bare `catch {}` fallbacks; on a genuine error, surface it (distinguish "not found" from "backend error").

**Verify:** a note that ranks in `search_notes` is readable by `read_note`; tag counts match between `get_tags` and search; a malformed backend response errors rather than silently "not found." Tests.

**Files:** `tools.ts`, `cli.ts`, `index.ts`.

---

## Step 6 — Read-only tools have no side effects (#7)

**Problem:** `waitForVault()` (index.ts:52-109), called by every read tool, auto-picks a vault (prefers one named "claude", else first) and runs a full **synchronous** `indexVault` inside the triggering call. A user calling `search_notes` can silently index an unrelated vault, blocking the call for the whole walk. Control flow is a convoluted 5s/50-iteration poll with redundant guards.

**Change:**
- Read tools must not auto-select or full-index. If no vault is selected, return a clear "no vault selected — call vault_select" error instead of guessing.
- Move any indexing to explicit `vault_select`/`reindex` (and the background job in Step 8).
- Simplify the polling loop / redundant `if (!selectedVault)` guards.

**Verify:** `search_notes` with no vault selected returns a clear error and does not index anything; no synchronous full-index runs inside a read tool. Tests.

**Files:** `index.ts`.

---

## Step 7 — Real batching + non-blocking embedding (#8, honorable-mention "fake batching")

**Problem:** `reindex embed:true` runs a blocking `do { batchCount = await embedChunks(...) } while (batchCount > 0)` inside the MCP handler (tools.ts:299-311, index.ts:124-128). `embedChunks` claims `batchSize=32` but `embedBatch` loops `embed` one text at a time (index.ts:124-128) — no throughput benefit; large vaults exceed the MCP timeout, leaving embeddings half-populated.

**Change:**
- Implement true batched embedding (pass an array of texts to the transformer in one call where the model API allows, or at least amortize model overhead) so `batchSize=32` is real.
- Move embedding off the request path into a background job with checkpointing + progress reporting (see Step 8); `reindex` enqueues and returns immediately with a status handle.

**Verify:** embedding 1000 chunks doesn't block the MCP call to timeout; `index_status` reports progress; batching measurably reduces per-chunk overhead. Tests.

**Files:** `retriever.ts`, `index.ts`, `tools.ts`.

---

## Step 8 — Vector search without full-table O(N) JSON re-parse (#4)

**Problem:** every semantic query calls `store.getChunks(vaultName)` — pulls **all** chunks into memory — then `JSON.parse`s each embedding and computes cosine in JS (retriever.ts:35-57). No ANN index, no vector column; embeddings stored as JSON text re-parsed every search. Falls over at a few thousand chunks.

**Change:**
- Store embeddings as a persisted `Float32Array`/BLOB column instead of JSON text (eliminates per-query `JSON.parse`).
- Add an approximate-nearest-neighbor path: prefer `sqlite-vec` (or `sqlite-vss`) if available; otherwise keep the brute-force scan but over the BLOB column and cap it. Fall back gracefully if the vector extension isn't installed.

**Verify:** semantic search over several thousand chunks completes in well under the prior multi-hundred-ms; results match the brute-force baseline within tolerance. Tests/benchmark.

**Files:** `store.ts`, `retriever.ts`, `indexer.ts`.

**Note:** largest step; if split, do the BLOB/Float32 migration first (removes JSON.parse), then the ANN index.

---

## Step 9 — `sanitizeQuery` matches its own contract; FTS5 errors don't leak (#9)

**Problem:** `sanitizeQuery` (store.ts:49-65) documents stripping bare wildcards *and* unbalanced parentheses, but only strips a leading `*`. Parens are never touched, `col:term` isn't escaped, `NEAR`/`AND`/`OR`/`NOT` handling is partial. A query with `(`, `)`, `:`, or a stray `"` throws an FTS5 syntax error that fails the whole `search_notes`.

**Change:**
- Actually strip/balance parentheses, escape or neutralize column-filter `:` syntax, and quote stray operators so arbitrary user text can't produce an FTS5 syntax error.
- Wrap the FTS5 query in a try/catch that degrades to a sanitized/quoted literal search rather than throwing.

**Verify:** queries containing `(`, `)`, `:`, `"`, and `AND`/`OR`/`NEAR` as literals all return results (or empty) without an unhandled exception. Tests for each.

**Files:** `store.ts`.

---

## Step 10 — Fail fast on missing native dep instead of runtime `npm install` (#10)

**Problem:** on first DB access, if `better-sqlite3` is missing, `store.ts:17-44` shells out to a synchronous `execSync("npm install ...")` (up to 60s) inside the plugin cache dir — couples runtime to network, blocks the event loop, may trigger native-compile, writes into a dir the server doesn't own.

**Change:**
- Remove the runtime `npm install`. If `better-sqlite3` is missing, throw a clear error with install instructions (or handle it at plugin install time via a postinstall the user controls).

**Verify:** with the dep missing, the server errors immediately with actionable text and does not run `npm install`. Test (mock the missing-module path).

**Files:** `store.ts`.

---

## Step 11 — Honorable-mention fixes

**Change:**
- **Embedding dimension mismatch (retriever.ts:140-141):** `cosineSimilarity` returns `0` on mismatched vectors, silently hiding results if the model changes. Detect a dimension mismatch and surface an error / trigger re-embed instead of silent zero.
- **Path-traversal guard comment (vault.ts:13-25):** the comment claims `resolve()` handles symlinks — it doesn't (that's `realpath`). Use `fs.realpathSync` for the containment check, and fix the comment.
- **FTS5 tags as raw JSON (store.ts:127-150):** the `tags` column is fed literal `["a","b"]`, polluting keyword search with brackets/quotes. Feed a space-joined token list instead.
- **Dead parameter (tools.ts:31):** `getVault` destructured as `_getVault`, never used — remove it.

**Verify:** symlink escaping the vault is caught; tag search matches bare tokens; a model-dim change surfaces an error; no unused destructure. Tests.

**Files:** `retriever.ts`, `vault.ts`, `store.ts`, `tools.ts`.

---

## Suggested step grouping for `/step-by-step`

Step 1 (embeddings during indexing) + Step 2 (delete stale) are the foundation for real search — do first. Steps 3, 4 depend on them. Steps 5, 6 (dedup backends / no side effects) are independent architectural cleanups. Steps 7→8 (batching → vector index) chain around embedding performance. Steps 9, 10, 11 are independent and can go any time.
