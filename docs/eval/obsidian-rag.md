# obsidian-rag — Code Review Findings

**Package**: `packages/obsidian-rag`  
**Scope**: All source files in `src/` (14 files)  
**Findings**: 2 HIGH, 2 MEDIUM

---

## obsidian-rag-1: HIGH — `vault_select` re-throws instead of returning MCP isError

**File**: `packages/obsidian-rag/src/tools.ts`  
**Lines**: 118-121  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

```typescript
// tools.ts:114-122
try {
  await store.setVault(vaultPath);
  resolveSelect?.(vaultPath);
  return { content: [{ type: "text", text: `Vault selected: ${vaultName}\nPath: ${vaultPath}` }] };
} catch (err) {
  rejectSelect?.(err as Error);
  throw err;  // ← RE-THROWS — does NOT return MCP error response
}
```

Every other error path in the same function and across all tool handlers returns `{ content: [...], isError: true }`. This is the only path that re-throws. Compare with the correct pattern 26 lines earlier:

```typescript
// tools.ts:93-96 (correct)
if (!vaultPath) {
  return { content: [{ type: "text", text: `Vault "${vaultName}" not found.` }], isError: true };
}
```

### Impact

If `store.setVault()` throws (DB open failure, permission error, disk full), the error propagates as an unhandled promise rejection through the MCP SDK. The SDK may crash the server connection or surface an internal error (`"Internal error"`) to the client instead of a clean tool error with details. The `rejectSelect` call correctly rejects awaiting callers, but the `throw` kills the MCP transport.

### Fix

Return an MCP error response instead of re-throwing:

```typescript
} catch (err) {
  rejectSelect?.(err as Error);
  return { content: [{ type: "text", text: `Failed to select vault: ${(err as Error).message}` }], isError: true };
}
```

---

## obsidian-rag-2: HIGH — Resource URI parsing breaks on "notes" path segment

**File**: `packages/obsidian-rag/src/index.ts`  
**Lines**: 158-162  
**Category**: correctness  
**Verification**: PLAUSIBLE (confirmed bug exists, wording slightly imprecise)

### Problem

```typescript
// index.ts:161
const notePath = decodeURIComponent(uri.pathname.split("/notes/")[1] || "");
```

`String.split("/notes/")` splits on **every** occurrence of `/notes/`, not just the first. If a note's path contains a directory segment literally named "notes":

```
URI: obsidian://notes/projects/notes/config.md
pathname: /notes/projects/notes/config.md
split("/notes/"):  ["", "projects/", "config.md"]
[1]:                "projects/"
```

The extracted path is `"projects/"` — everything after the second `/notes/` is lost. The URI resource handler then fails to find the note or returns wrong content.

Trigger: any vault where a subdirectory is named "notes" (e.g., `projects/notes/`, `meeting-notes/` → no, the segment must be exactly "notes").

### Impact

Resource reads via MCP resource URIs fail for notes under a directory literally named "notes". Tools like `read_note` are unaffected (they use function parameters, not URI parsing).

### Fix

Use `String.replace` with a regex anchored to the start, or `String.slice`:

```typescript
// Option A: replace only the prefix
const notePath = decodeURIComponent(uri.pathname.replace(/^\/notes\//, ""));

// Option B: slice past the known prefix
const prefix = "/notes/";
const notePath = uri.pathname.startsWith(prefix) 
  ? decodeURIComponent(uri.pathname.slice(prefix.length)) 
  : "";
```

---

## obsidian-rag-3: MEDIUM — Oversize chunks when first section exceeds limit

**File**: `packages/obsidian-rag/src/indexer.ts`  
**Lines**: 25-30  
**Category**: robustness  
**Verification**: CONFIRMED

### Problem

```typescript
// indexer.ts:25-30
if (currentChunk.length + text.length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
  chunks.push(currentChunk);
  currentChunk = "";
}
```

The condition `currentChunk.length > 0` protects against pushing an empty chunk. But when `currentChunk` is empty and `text.length > MAX_CHUNK_CHARS`, the condition is `false` and `text` is appended whole:

```typescript
currentChunk += (currentChunk ? "\n\n" : "") + text;
```

A single heading section with 5000+ characters produces a 5000+ char chunk. There is no sub-splitting of the individual text block.

### Impact

Chunks exceeding the embedding model's token limit (typically 512 tokens, ~2000 chars) get truncated during embedding, losing content. The oversized chunk also degrades search quality because the vector averages over too much text.

### Fix

When `text.length > MAX_CHUNK_CHARS`, sub-split it on sentence or paragraph boundaries:

```typescript
if (currentChunk.length + text.length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
  chunks.push(currentChunk);
  currentChunk = "";
}
// Sub-split oversized text
while (text.length > MAX_CHUNK_CHARS) {
  const splitPoint = text.lastIndexOf(". ", MAX_CHUNK_CHARS);
  const cut = splitPoint > MAX_CHUNK_CHARS / 2 ? splitPoint + 1 : MAX_CHUNK_CHARS;
  chunks.push(text.slice(0, cut).trim());
  text = text.slice(cut).trim();
}
currentChunk += (currentChunk ? "\n\n" : "") + text;
```

---

## obsidian-rag-4: MEDIUM — Directory filter LIKE pattern overmatches

**File**: `packages/obsidian-rag/src/store.ts`  
**Lines**: 288-290  
**Category**: correctness  
**Verification**: CONFIRMED

### Problem

```typescript
// store.ts:288-290
.all(vaultName, `${directory}%`);
```

SQL `LIKE 'folder-a%'` matches `folder-a/file.md` but also `folder-abc/file.md` because the pattern lacks a path separator. The test suite passes `"folder-a/"` with trailing slash, but the `list_notes` tool handler passes user input directly:

```typescript
// tools.ts — list_notes handler passes directory unmodified
const notes = store.listNotes(selectedVault, directory);
```

If a user calls `list_notes({ directory: "folder-a" })`, notes under `folder-abc/` are also returned.

### Impact

`list_notes` returns extra notes from unintended subdirectories when a directory name is a prefix of another directory name. No security impact (same vault, same access), but correctness issue for directory filtering.

### Fix

Append `/` to the pattern, ensuring the match is at a directory boundary:

```typescript
const pattern = directory.endsWith("/") ? `${directory}%` : `${directory}/%`;
.all(vaultName, pattern);
```

Or normalize in the tool handler:

```typescript
const normalizedDir = directory.endsWith("/") ? directory : `${directory}/`;
```
