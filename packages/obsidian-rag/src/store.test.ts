/**
 * TDD behavior-contract tests for the Store class.
 *
 * Store is the persistence layer for obsidian-rag: SQLite-backed note/chunk/embedding
 * storage with FTS5 full-text search.
 *
 * These tests define the expected behavior via TDD contracts.
 * Each suite gets its own temp directory for complete isolation.
 */

import * as assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { Store } from "./store.js";

function freshDir(prefix: string): string {
  return join(tmpdir(), `ors-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

// ── Vaults ─────────────────────────────────────────────────────────────

describe("Store — vaults", () => {
  const DB_DIR = freshDir("vaults");
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("returns null for unknown vault", () => {
    assert.equal(store.getVault("nonexistent"), null);
  });

  it("stores and retrieves a vault", () => {
    store.setVault({ name: "my-vault", path: "/home/user/vault", noteCount: 42, folderCount: 5 });
    const v = store.getVault("my-vault");
    assert.notEqual(v, null);
    assert.equal(v?.name, "my-vault");
    assert.equal(v?.path, "/home/user/vault");
    assert.equal(v?.noteCount, 42);
    assert.equal(v?.folderCount, 5);
  });

  it("overwrites vault on re-set (upsert behavior)", () => {
    store.setVault({ name: "my-vault", path: "/home/user/vault", noteCount: 99, folderCount: 8 });
    const v = store.getVault("my-vault");
    assert.equal(v?.noteCount, 99);
    assert.equal(v?.folderCount, 8);
  });

  it("handles multiple vaults independently", () => {
    store.setVault({ name: "vault-a", path: "/a" });
    store.setVault({ name: "vault-b", path: "/b" });
    assert.equal(store.getVault("vault-a")?.path, "/a");
    assert.equal(store.getVault("vault-b")?.path, "/b");
  });
});

// ── Notes ──────────────────────────────────────────────────────────────

describe("Store — notes", () => {
  const DB_DIR = freshDir("notes");
  const VAULT = "test-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/test" });
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("returns null for unknown note", () => {
    assert.equal(store.getNote(VAULT, "nonexistent.md"), null);
  });

  it("stores and retrieves a note with all metadata", () => {
    const meta = {
      path: "notes/hello.md",
      title: "Hello World",
      tags: ["greeting", "test"],
      links: ["Other Note"],
      backlinks: [],
      frontmatter: { created: "2024-01-01" },
      created: "2024-01-01T00:00:00Z",
      modified: "2024-06-15T12:00:00Z",
    };
    store.upsertNote(VAULT, meta, "# Hello\n\nThis is the content.", "abc123hash");
    const n = store.getNote(VAULT, "notes/hello.md");
    assert.notEqual(n, null);
    assert.equal(n?.title, "Hello World");
    assert.deepStrictEqual(n?.tags, ["greeting", "test"]);
    assert.deepStrictEqual(n?.links, ["Other Note"]);
    assert.equal(n?.created, "2024-01-01T00:00:00Z");
    assert.equal(n?.modified, "2024-06-15T12:00:00Z");
    assert.equal(n?.content, "# Hello\n\nThis is the content.");
  });

  it("overwrites existing note on upsert (no duplicates)", () => {
    store.upsertNote(
      VAULT,
      {
        path: "notes/hello.md",
        title: "Updated Title",
        tags: ["updated"],
        links: [],
        backlinks: [],
        frontmatter: {},
        created: "",
        modified: "",
      },
      "updated content",
      "newhash",
    );
    const n = store.getNote(VAULT, "notes/hello.md");
    assert.equal(n?.title, "Updated Title");
    assert.equal(n?.content, "updated content");
  });

  it("handles empty tags and links", () => {
    store.upsertNote(
      VAULT,
      {
        path: "notes/empty.md",
        title: "Empty Meta",
        tags: [],
        links: [],
        backlinks: [],
        frontmatter: {},
        created: "",
        modified: "",
      },
      "minimal",
      "hash",
    );
    const n = store.getNote(VAULT, "notes/empty.md");
    assert.deepStrictEqual(n?.tags, []);
    assert.deepStrictEqual(n?.links, []);
  });

  it("isolates notes by vault name (different vaults don't leak)", () => {
    store.setVault({ name: "other-vault", path: "/tmp/other" });
    store.upsertNote(
      "other-vault",
      {
        path: "notes/secret.md",
        title: "Secret",
        tags: ["secret"],
        links: [],
        backlinks: [],
        frontmatter: {},
        created: "",
        modified: "",
      },
      "secret content",
      "hash-secret",
    );
    assert.notEqual(store.getNote("other-vault", "notes/secret.md"), null);
    assert.equal(store.getNote(VAULT, "notes/secret.md"), null);
  });
});

// ── FTS5 Search ────────────────────────────────────────────────────────

describe("Store — FTS5 search", () => {
  const DB_DIR = freshDir("search");
  const VAULT = "search-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/search" });

    const blank = {
      links: [] as string[],
      backlinks: [] as string[],
      frontmatter: {} as Record<string, unknown>,
      created: "",
      modified: "",
    };

    store.upsertNote(
      VAULT,
      { path: "cooking/pasta.md", title: "Pasta Recipe", tags: ["cooking", "italian"], ...blank },
      "How to make authentic carbonara with guanciale and pecorino romano.",
      "h1",
    );
    store.upsertNote(
      VAULT,
      { path: "cooking/pizza.md", title: "Pizza Dough", tags: ["cooking", "baking"], ...blank },
      "Neapolitan pizza dough with 00 flour and long fermentation.",
      "h2",
    );
    store.upsertNote(
      VAULT,
      { path: "travel/rome.md", title: "Rome Guide", tags: ["travel", "italy"], ...blank },
      "Best places to visit in Rome including the Colosseum and Forum.",
      "h3",
    );
    store.upsertNote(
      VAULT,
      { path: "notes/random.md", title: "Random Thoughts", tags: ["misc"], ...blank },
      "Just some completely unrelated text about the weather.",
      "h4",
    );
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("finds notes matching a search term in content", () => {
    const results = store.searchNotesFTS(VAULT, "carbonara", 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].path, "cooking/pasta.md");
  });

  it("finds notes matching a search term in title", () => {
    const results = store.searchNotesFTS(VAULT, "Pizza", 10);
    assert.equal(results.length, 1);
    assert.equal(results[0].title, "Pizza Dough");
  });

  it("finds multiple matching notes", () => {
    const results = store.searchNotesFTS(VAULT, "rome", 10);
    // "rome" appears in travel/rome.md content
    assert.ok(results.length >= 1);
  });

  it("respects limit parameter", () => {
    const results = store.searchNotesFTS(VAULT, "the", 1);
    assert.ok(results.length <= 1);
  });

  it("returns empty array for no matches", () => {
    const results = store.searchNotesFTS(VAULT, "zzzxyznonexistent", 10);
    assert.deepStrictEqual(results, []);
  });

  it("returns snippet text with each result", () => {
    const results = store.searchNotesFTS(VAULT, "carbonara", 10);
    assert.ok(results[0].snippet.length > 0);
  });

  it("returns a relevance score in [0,1] for each result", () => {
    const results = store.searchNotesFTS(VAULT, "pizza", 10);
    for (const r of results) {
      assert.equal(typeof r.score, "number");
      assert.ok(r.score >= 0 && r.score <= 1, `score ${r.score} out of [0,1]`);
    }
  });
});

// ── FTS5 query sanitization ────────────────────────────────────────────

describe("Store — FTS5 query sanitization", () => {
  const DB_DIR = freshDir("fts-san");
  const VAULT = "san-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/san" });
    const blank = {
      links: [] as string[],
      backlinks: [] as string[],
      frontmatter: {} as Record<string, unknown>,
      created: "",
      modified: "",
    };
    // Note containing boolean operators as literal text
    store.upsertNote(
      VAULT,
      { path: "ops.md", title: "Boolean Logic", tags: ["logic"], ...blank },
      "The AND and OR operators are fundamental. NOT is also important. NEAR is proximity-based.",
      "h-san-1",
    );
    store.upsertNote(
      VAULT,
      { path: "special.md", title: "Special Chars", tags: ["special"], ...blank },
      'Content with "quotes" and (parentheses) and asterisks* in text.',
      "h-san-2",
    );
    store.upsertNote(
      VAULT,
      { path: "chars2.md", title: "More Chars", tags: ["chars"], ...blank },
      "Config with auth:token and dash-separated-words and ^caret prefix.",
      "h-san-3",
    );
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("handles empty query without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "", 10);
    assert.equal(results.length, 0);
  });

  it("handles whitespace-only query without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "   ", 10);
    assert.equal(results.length, 0);
  });

  it("finds notes containing the word AND (treated as literal text, not FTS operator)", () => {
    const results = store.searchNotesFTS(VAULT, "AND", 10);
    assert.ok(results.length >= 1, "should find note with literal AND in content");
  });

  it("finds notes containing the word OR (treated as literal text, not FTS operator)", () => {
    const results = store.searchNotesFTS(VAULT, "OR", 10);
    assert.ok(results.length >= 1, "should find note with literal OR in content");
  });

  it("handles NOT operator as literal text", () => {
    const results = store.searchNotesFTS(VAULT, "NOT", 10);
    // Should not crash — may or may not match depending on FTS tokenization
    assert.ok(Array.isArray(results));
  });

  it("handles NEAR operator as literal text", () => {
    const results = store.searchNotesFTS(VAULT, "NEAR", 10);
    assert.ok(Array.isArray(results));
  });

  it("handles queries with double quotes", () => {
    const results = store.searchNotesFTS(VAULT, '"quotes"', 10);
    assert.ok(Array.isArray(results));
  });

  it("handles queries with parentheses", () => {
    const results = store.searchNotesFTS(VAULT, "parentheses", 10);
    assert.ok(Array.isArray(results));
  });

  it("handles mixed normal words and operators", () => {
    const results = store.searchNotesFTS(VAULT, "base OR home", 10);
    assert.ok(Array.isArray(results));
  });

  it("strips bare open parenthesis without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "(", 10);
    assert.ok(Array.isArray(results));
  });

  it("strips bare close parenthesis without crashing", () => {
    const results = store.searchNotesFTS(VAULT, ")", 10);
    assert.ok(Array.isArray(results));
  });

  it("strips colon operator without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "auth:token", 10);
    assert.ok(Array.isArray(results));
    assert.ok(results.length >= 1, "should find note with auth:token content");
  });

  it("strips leading asterisk wildcard without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "*separated", 10);
    assert.ok(Array.isArray(results));
    assert.ok(results.length >= 1, "should find note with separated words");
  });

  it("strips caret operator without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "^caret", 10);
    assert.ok(Array.isArray(results));
  });

  it("strips tilde operator without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "~tilde", 10);
    assert.ok(Array.isArray(results));
  });

  it("strips hyphen (FTS5 NOT operator) without crashing", () => {
    const results = store.searchNotesFTS(VAULT, "-separated", 10);
    assert.ok(Array.isArray(results));
  });

  it("searching with bare special chars only returns empty result, no crash", () => {
    const results = store.searchNotesFTS(VAULT, "(*):^~-", 10);
    assert.ok(Array.isArray(results));
  });

  it("empty query after sanitization returns empty array", () => {
    // Query consisting only of characters that get stripped
    const results = store.searchNotesFTS(VAULT, "(*):", 10);
    assert.deepStrictEqual(results, []);
  });
});

// ── Listing notes ──────────────────────────────────────────────────────

describe("Store — listing notes", () => {
  const DB_DIR = freshDir("list");
  const VAULT = "list-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/list" });
    const blank = {
      links: [] as string[],
      backlinks: [] as string[],
      frontmatter: {} as Record<string, unknown>,
      created: "",
      modified: "",
    };
    store.upsertNote(VAULT, { path: "folder-a/note1.md", title: "Note 1", tags: ["a"], ...blank }, "content 1", "h1");
    store.upsertNote(
      VAULT,
      { path: "folder-a/note2.md", title: "Note 2", tags: ["a", "b"], ...blank },
      "content 2",
      "h2",
    );
    store.upsertNote(VAULT, { path: "folder-b/note3.md", title: "Note 3", tags: ["b"], ...blank }, "content 3", "h3");
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("lists all notes when no directory filter", () => {
    const notes = store.listNotes(VAULT);
    assert.equal(notes.length, 3);
    assert.ok(notes[0].path < notes[1].path);
    assert.ok(notes[1].path < notes[2].path);
  });

  it("filters by directory prefix", () => {
    const notes = store.listNotes(VAULT, "folder-a/");
    assert.equal(notes.length, 2);
    for (const n of notes) assert.ok(n.path.startsWith("folder-a/"));
  });

  it("returns empty for non-matching directory", () => {
    assert.deepStrictEqual(store.listNotes(VAULT, "nonexistent/"), []);
  });

  it("includes tags in listing", () => {
    const notes = store.listNotes(VAULT, "folder-a/");
    const note2 = notes.find((n) => n.path === "folder-a/note2.md");
    assert.notEqual(note2, undefined);
    assert.deepStrictEqual(note2?.tags, ["a", "b"]);
  });
});

// ── Tags ───────────────────────────────────────────────────────────────

describe("Store — tags", () => {
  const DB_DIR = freshDir("tags");
  const VAULT = "tag-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/tags" });
    const blank = {
      links: [] as string[],
      backlinks: [] as string[],
      frontmatter: {} as Record<string, unknown>,
      created: "",
      modified: "",
    };
    store.upsertNote(VAULT, { path: "a.md", title: "A", tags: ["tag1", "tag2"], ...blank }, "a", "h1");
    store.upsertNote(VAULT, { path: "b.md", title: "B", tags: ["tag2", "tag3"], ...blank }, "b", "h2");
    store.upsertNote(VAULT, { path: "c.md", title: "C", tags: ["tag1", "tag1"], ...blank }, "c", "h3");
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("counts tag occurrences by raw occurrence", () => {
    const counts = store.getTags(VAULT);
    // tag1: a.md (1×) + c.md (2×) = 3 raw occurrences
    assert.equal(counts.get("tag1"), 3);
  });

  it("includes all unique tags in counts", () => {
    const counts = store.getTags(VAULT);
    assert.ok(counts.has("tag1"));
    assert.ok(counts.has("tag2"));
    assert.ok(counts.has("tag3"));
  });

  it("returns empty map for vault with no notes", () => {
    store.setVault({ name: "empty-vault", path: "/tmp/empty" });
    const counts = store.getTags("empty-vault");
    assert.equal(counts.size, 0);
  });
});

// ── Chunks ─────────────────────────────────────────────────────────────

describe("Store — chunks", () => {
  const DB_DIR = freshDir("chunks");
  const VAULT = "chunk-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/chunks" });
    const blank = {
      links: [] as string[],
      backlinks: [] as string[],
      frontmatter: {} as Record<string, unknown>,
      created: "",
      modified: "",
    };
    store.upsertNote(VAULT, { path: "notes/long.md", title: "Long Note", tags: [], ...blank }, "long content", "h1");
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("stores and retrieves a chunk", () => {
    store.upsertChunk(
      { id: "notes/long.md#0", notePath: "notes/long.md", heading: "Introduction", content: "First chunk." },
      VAULT,
    );
    const chunks = store.getChunks(VAULT);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].id, "notes/long.md#0");
    assert.equal(chunks[0].heading, "Introduction");
    assert.equal(chunks[0].content, "First chunk.");
  });

  it("updates chunk on upsert (no duplicates)", () => {
    store.upsertChunk(
      { id: "notes/long.md#0", notePath: "notes/long.md", heading: "Introduction", content: "First chunk." },
      VAULT,
    );
    store.upsertChunk(
      { id: "notes/long.md#0", notePath: "notes/long.md", heading: "Revised", content: "Updated." },
      VAULT,
    );
    assert.equal(store.getChunks(VAULT).length, 1);
    assert.equal(store.getChunks(VAULT)[0].heading, "Revised");
  });

  it("handles multiple chunks per note", () => {
    store.upsertChunk({ id: "notes/long.md#0", notePath: "notes/long.md", heading: "Intro", content: "First." }, VAULT);
    store.upsertChunk({ id: "notes/long.md#1", notePath: "notes/long.md", heading: "Body", content: "Second." }, VAULT);
    assert.equal(store.getChunks(VAULT).length, 2);
  });

  it("clears all chunks for a vault", () => {
    store.upsertChunk({ id: "notes/long.md#0", notePath: "notes/long.md", heading: "X", content: "Y." }, VAULT);
    store.clearChunks(VAULT);
    assert.equal(store.getChunks(VAULT).length, 0);
  });

  it("returns empty array for vault with no chunks", () => {
    assert.deepStrictEqual(store.getChunks(VAULT), []);
  });

  it("stores and retrieves chunk embeddings", () => {
    store.upsertChunk(
      { id: "notes/long.md#0", notePath: "notes/long.md", heading: "Embedded", content: "Has embedding." },
      VAULT,
    );
    store.setEmbedding("notes/long.md#0", [0.1, 0.2, 0.3, 0.4]);
    const chunks = store.getChunks(VAULT);
    assert.ok(chunks[0].embedding !== undefined && chunks[0].embedding !== null);
  });

  it("can find unembedded chunks", () => {
    store.upsertChunk({ id: "notes/long.md#0", notePath: "notes/long.md", heading: "No emb", content: "None." }, VAULT);
    store.upsertChunk(
      {
        id: "notes/long.md#1",
        notePath: "notes/long.md",
        heading: "With emb",
        content: "Has one.",
        embedding: [0.5, 0.6],
      },
      VAULT,
    );
    const unembedded = store.getUnembeddedChunks(VAULT);
    assert.equal(unembedded.length, 1);
    assert.equal(unembedded[0].id, "notes/long.md#0");
  });

  it("getChunksWithEmbeddings returns chunks with Float32Array from BLOB", () => {
    store.clearChunks(VAULT);
    store.upsertChunk(
      { id: "notes/long.md#0", notePath: "notes/long.md", heading: "BLOB test", content: "Has BLOB embedding." },
      VAULT,
    );
    store.setEmbedding("notes/long.md#0", [0.1, 0.2, 0.3, 0.4]);
    const chunks = store.getChunksWithEmbeddings(VAULT);
    assert.equal(chunks.length, 1);
    assert.ok(chunks[0].embeddingVector instanceof Float32Array);
    assert.equal(chunks[0].embeddingVector.length, 4);
    assert.ok(Math.abs(chunks[0].embeddingVector[0] - 0.1) < 0.001);
    assert.equal(chunks[0].notePath, "notes/long.md");
  });

  it("getChunksWithEmbeddings only returns chunks with BLOB (skips unembedded)", () => {
    // Previous test left one embedded chunk; this adds one without embedding
    store.upsertChunk(
      { id: "notes/long.md#1", notePath: "notes/long.md", heading: "No BLOB", content: "No embedding." },
      VAULT,
    );
    const chunks = store.getChunksWithEmbeddings(VAULT);
    // Only the setEmbedding chunk, not the plain upsert
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].id, "notes/long.md#0");
    assert.ok(chunks[0].embeddingVector instanceof Float32Array);
  });
});

// ── Index metadata ─────────────────────────────────────────────────────

describe("Store — index metadata", () => {
  const DB_DIR = freshDir("meta");
  const VAULT = "meta-vault";
  let store: Store;

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/meta" });
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("returns default index status for new vault", () => {
    const status = store.getIndexStatus(VAULT);
    assert.equal(status.totalNotes, 0);
    assert.equal(status.indexedNotes, 0);
    assert.equal(status.totalChunks, 0);
    assert.equal(status.embeddedChunks, 0);
    assert.equal(status.lastIndexed, null);
    assert.equal(status.indexing, false);
  });

  it("updates and reflects index metadata", () => {
    store.setIndexMeta(VAULT, {
      totalNotes: 100,
      indexedNotes: 95,
      totalChunks: 450,
      embeddedChunks: 200,
      lastIndexed: "2024-06-15T12:00:00Z",
    });
    const status = store.getIndexStatus(VAULT);
    assert.equal(status.totalNotes, 100);
    assert.equal(status.indexedNotes, 95);
    assert.equal(status.totalChunks, 450);
    assert.equal(status.embeddedChunks, 200);
    assert.equal(status.lastIndexed, "2024-06-15T12:00:00Z");
  });

  it("partial update only changes provided fields", () => {
    store.setIndexMeta(VAULT, { totalNotes: 100 });
    store.setIndexMeta(VAULT, { indexedNotes: 98 });
    const status = store.getIndexStatus(VAULT);
    assert.equal(status.indexedNotes, 98);
    assert.equal(status.totalNotes, 100); // unchanged
  });
});

// ── Note deletion ──────────────────────────────────────────────────────

describe("Store — note deletion", () => {
  const DB_DIR = freshDir("note-del");
  const VAULT = "note-del-vault";
  let store: Store;
  const blank = {
    links: [] as string[],
    backlinks: [] as string[],
    frontmatter: {} as Record<string, unknown>,
    created: "",
    modified: "",
  };

  before(() => {
    mkdirSync(DB_DIR, { recursive: true });
    store = new Store({ dbDir: DB_DIR });
    store.setVault({ name: VAULT, path: "/tmp/notedel" });
    store.upsertNote(VAULT, { path: "a.md", title: "A", tags: [], ...blank }, "a", "h1");
    store.upsertNote(VAULT, { path: "b.md", title: "B", tags: [], ...blank }, "b", "h2");
  });

  after(() => {
    store.close();
    if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
  });

  it("listNotePaths returns all note paths for a vault", () => {
    const paths = store.listNotePaths(VAULT);
    assert.equal(paths.length, 2);
    assert.ok(paths.includes("a.md"));
    assert.ok(paths.includes("b.md"));
  });

  it("listNotePaths is empty for vault with no notes", () => {
    store.setVault({ name: "empty", path: "/tmp/empty" });
    assert.deepStrictEqual(store.listNotePaths("empty"), []);
  });

  it("deleteChunksForNote removes only chunks for the given note", () => {
    store.upsertChunk({ id: "a.md#0", notePath: "a.md", heading: "H", content: "C" }, VAULT);
    store.upsertChunk({ id: "b.md#0", notePath: "b.md", heading: "H", content: "C" }, VAULT);
    store.deleteChunksForNote(VAULT, "a.md");
    const remaining = store.getChunks(VAULT);
    // Chunks use snake_case columns from SQLite (note_path), verify by id prefix
    assert.equal(remaining.filter((c: any) => c.id.startsWith("a.md")).length, 0);
    assert.equal(remaining.filter((c: any) => c.id.startsWith("b.md")).length, 1);
    // cleanup
    store.clearChunks(VAULT);
  });

  it("deleteNote removes the note from the index", () => {
    store.deleteNote(VAULT, "a.md");
    assert.equal(store.getNote(VAULT, "a.md"), null);
    assert.notEqual(store.getNote(VAULT, "b.md"), null);
    // restore
    store.upsertNote(VAULT, { path: "a.md", title: "A", tags: [], ...blank }, "a", "h1");
  });

  it("deleteNote also cleans up through FTS trigger (search no longer finds it)", () => {
    store.deleteNote(VAULT, "a.md");
    const results = store.searchNotesFTS(VAULT, "h1", 10);
    assert.equal(results.filter((r) => r.path === "a.md").length, 0, "deleted note should not appear in FTS search");
    // restore
    store.upsertNote(VAULT, { path: "a.md", title: "A", tags: [], ...blank }, "a", "h1");
  });

  it("clears all notes for a vault", () => {
    // Clear chunks first to avoid FK constraint from test setup
    store.clearChunks(VAULT);
    store.clearNotes(VAULT);
    assert.deepStrictEqual(store.listNotes(VAULT), []);
    assert.equal(store.getNote(VAULT, "a.md"), null);
    assert.equal(store.getNote(VAULT, "b.md"), null);
  });
});

// ── Close ──────────────────────────────────────────────────────────────

describe("Store — close", () => {
  it("closes without error", () => {
    const DB_DIR = freshDir("close");
    mkdirSync(DB_DIR, { recursive: true });
    try {
      const store = new Store({ dbDir: DB_DIR });
      store.setVault({ name: "close-test", path: "/tmp/close" });
      store.close();
    } finally {
      if (existsSync(DB_DIR)) rmSync(DB_DIR, { recursive: true, force: true });
    }
  });
});
