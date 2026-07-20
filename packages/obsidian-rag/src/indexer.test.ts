import * as assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const storeNotes: Map<string, any> = new Map();
const storeChunks: any[] = [];
const metaCalls: any[] = [];
const IndexedPaths: any[] = [];

const mockStore = {
  setIndexMeta: mock.fn((_vn: string, meta: any) => metaCalls.push(meta)),
  getNote: mock.fn((_vn: string, file: string) => storeNotes.get(file) ?? null),
  upsertNote: mock.fn((_vn: string, note: any, content: string, hash: string) => {
    storeNotes.set(note.path, { ...note, content, contentHash: hash });
  }),
  upsertChunk: mock.fn((chunk: any, _vn: string) => storeChunks.push(chunk)),
  clearChunks: mock.fn((_vn: string) => {
    storeChunks.length = 0;
  }),
  clearNotes: mock.fn((_vn: string) => {
    storeNotes.clear();
  }),
  deleteChunksForNote: mock.fn((_vn: string, notePath: string) => {
    for (let i = storeChunks.length - 1; i >= 0; i--) {
      if (storeChunks[i].notePath === notePath) storeChunks.splice(i, 1);
    }
  }),
  deleteNote: mock.fn((_vn: string, path: string) => {
    storeNotes.delete(path);
  }),
  listNotePaths: mock.fn((_vn: string) => [...IndexedPaths]),
};

const walkResult: string[] = [];
const readResults = new Map<string, any>();
let readThrows = false;

const embedChunksCalls: string[] = [];

mock.module("./retriever.js", {
  namedExports: {
    embedChunks: mock.fn(async (_store: any, vaultName: string, _embedder: any) => {
      embedChunksCalls.push(vaultName);
      return 0;
    }),
  },
});

mock.module("./vault.js", {
  namedExports: {
    walkVault: mock.fn(async (_vp: string) => [...walkResult]),
    readNote: mock.fn(async (_vp: string, file: string) => {
      if (readThrows) throw new Error("read error");
      return readResults.get(file) ?? { path: file, title: file, tags: [], links: [], content: "def", raw: "def" };
    }),
  },
});

/** Track which paths exist on the "filesystem" for reconciliation tests. */
const existingPaths = new Set<string>();

mock.module("node:fs", {
  namedExports: {
    existsSync: mock.fn((p: string) => {
      // p is the full path; check if the relative part (after last /vault/) is in existingPaths
      for (const rp of existingPaths) {
        if (p.endsWith(rp)) return true;
      }
      return false;
    }),
  },
});

describe("indexer", () => {
  let mod: any;

  beforeEach(async () => {
    storeNotes.clear();
    storeChunks.length = 0;
    metaCalls.length = 0;
    walkResult.length = 0;
    readResults.clear();
    readThrows = false;
    embedChunksCalls.length = 0;
    IndexedPaths.length = 0;
    existingPaths.clear();
    mod = await import("./indexer.js");
  });

  describe("chunkMarkdown", () => {
    it("single chunk for short text", () => {
      const chunks = mod.chunkMarkdown("t.md", "# H\nWorld");
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].heading, "H");
    });
    it("splits long content", () => {
      const long = `# H\n${"x".repeat(810)}\n# S2\n${"y".repeat(810)}`;
      assert.ok(mod.chunkMarkdown("t.md", long).length >= 2);
    });
    it("empty content = 1 chunk", () => assert.equal(mod.chunkMarkdown("t.md", "").length, 1));
    it("headings create sections", () => {
      const chunks = mod.chunkMarkdown("t.md", "# S1\nText\n# S2\nMore");
      assert.equal(chunks[0].heading, "S2");
    });
    it("code blocks intact", () => {
      const md = "# Intro\nText\n```\n# Not heading\n```\n# Real\nMore";
      assert.ok(mod.chunkMarkdown("t.md", md).length >= 1);
    });
    it("unique chunk IDs", () => {
      const chunks = mod.chunkMarkdown("n.md", "# A\n".repeat(50));
      assert.equal(new Set(chunks.map((c: any) => c.id)).size, chunks.length);
    });
    it("multi-heading long forces split", () => {
      const content = `# Intro\n${"y".repeat(810)}\n# S2\n${"z".repeat(810)}`;
      assert.ok(mod.chunkMarkdown("t.md", content).length >= 2);
    });
  });

  describe("hashContent", () => {
    it("16 chars hex", () => assert.ok(/^[0-9a-f]{16}$/.test(mod.hashContent("x"))));
    it("stable", () => assert.equal(mod.hashContent("a"), mod.hashContent("a")));
    it("different", () => assert.notEqual(mod.hashContent("a"), mod.hashContent("b")));
  });

  describe("indexVault", () => {
    it("indexes files and returns count", async () => {
      walkResult.push("a.md", "b.md");
      readResults.set("a.md", { path: "a.md", title: "A", tags: [], links: [], content: "CA", raw: "CA" });
      readResults.set("b.md", { path: "b.md", title: "B", tags: [], links: [], content: "CB", raw: "CB" });
      existingPaths.add("a.md");
      existingPaths.add("b.md");
      IndexedPaths.push("a.md", "b.md");
      assert.equal(await mod.indexVault("/v", "v1", mockStore), 2);
      assert.equal(storeChunks.length, 2);
    });
    it("skips unchanged files", async () => {
      walkResult.push("a.md");
      readResults.set("a.md", { path: "a.md", title: "A", tags: [], links: [], content: "Same", raw: "Same" });
      storeNotes.set("a.md", { path: "a.md", title: "A", content: "Same" });
      existingPaths.add("a.md");
      IndexedPaths.push("a.md");
      assert.equal(await mod.indexVault("/v", "v1", mockStore), 1);
    });
    it("empty vault returns 0", async () => {
      assert.equal(await mod.indexVault("/v", "v1", mockStore), 0);
    });
    it("embeds chunks when embedder provided", async () => {
      walkResult.push("a.md");
      readResults.set("a.md", { path: "a.md", title: "A", tags: [], links: [], content: "Content A", raw: "Content A" });
      existingPaths.add("a.md");
      IndexedPaths.push("a.md");
      const mockEmbedder = {
        embed: async (_t: string) => [0.1, 0.2, 0.3],
        embedBatch: async (_t: string[]) => [[0.1, 0.2, 0.3]],
      };
      await mod.indexVault("/v", "v1", mockStore, mockEmbedder);
      assert.ok(embedChunksCalls.length > 0);
      assert.equal(embedChunksCalls[0], "v1");
    });
    it("skips embedding when embedder is null", async () => {
      walkResult.push("a.md");
      readResults.set("a.md", { path: "a.md", title: "A", tags: [], links: [], content: "Content A", raw: "Content A" });
      existingPaths.add("a.md");
      IndexedPaths.push("a.md");
      await mod.indexVault("/v", "v1", mockStore, null);
      assert.equal(embedChunksCalls.length, 0);
    });
    it("skips embedding when embedder is undefined (default)", async () => {
      walkResult.push("a.md");
      readResults.set("a.md", { path: "a.md", title: "A", tags: [], links: [], content: "Content A", raw: "Content A" });
      existingPaths.add("a.md");
      IndexedPaths.push("a.md");
      await mod.indexVault("/v", "v1", mockStore);
      assert.equal(embedChunksCalls.length, 0);
    });

    it("deletes old chunks when note shrinks (deleteChunksForNote called before re-insert)", async () => {
      walkResult.push("long.md");
      readResults.set("long.md", { path: "long.md", title: "Long", tags: [], links: [], content: "short", raw: "short" });
      existingPaths.add("long.md");
      IndexedPaths.push("long.md");
      // Pre-populate with more chunks than new content would produce
      storeChunks.push(
        { id: "long.md#0", notePath: "long.md", content: "old0" },
        { id: "long.md#1", notePath: "long.md", content: "old1" },
        { id: "long.md#2", notePath: "long.md", content: "old2" },
      );
      await mod.indexVault("/v", "v1", mockStore);
      // After indexing, old chunks should be gone and only 1 new chunk remains
      const remaining = storeChunks.filter((c: any) => c.notePath === "long.md");
      assert.equal(remaining.length, 1);
      assert.notEqual(remaining[0].content, "old0");
    });

    it("reconciliation removes ghost notes (file missing on disk)", async () => {
      walkResult.push("alive.md");
      readResults.set("alive.md", { path: "alive.md", title: "Alive", tags: [], links: [], content: "X", raw: "X" });
      existingPaths.add("alive.md");
      // Index has a note that no longer exists on disk (not in existingPaths)
      IndexedPaths.push("dead.md", "alive.md");
      storeNotes.set("dead.md", { path: "dead.md", content: "ghost" });
      storeChunks.push({ id: "dead.md#0", notePath: "dead.md", content: "ghost" });
      await mod.indexVault("/v", "v1", mockStore);
      // dead.md should be removed from notes
      assert.equal(storeNotes.has("dead.md"), false, "ghost note deleted");
      // dead.md chunks should be gone
      const deadChunks = storeChunks.filter((c: any) => c.notePath === "dead.md");
      assert.equal(deadChunks.length, 0, "ghost chunks deleted");
    });
  });

  describe("reindexVault", () => {
    it("clears and reindexes", async () => {
      walkResult.push("single.md");
      readResults.set("single.md", { path: "single.md", title: "S", tags: [], links: [], content: "X", raw: "X" });
      storeNotes.set("old.md", { path: "old.md", content: "old" });
      storeChunks.push({ id: "old#0" });
      existingPaths.add("single.md");
      IndexedPaths.push("single.md");
      assert.equal(await mod.reindexVault("/v", "v1", mockStore), 1);
      assert.equal(storeNotes.get("old.md"), undefined);
    });
  });

  describe("indexNote", () => {
    it("indexes a single note with content", async () => {
      readResults.set("Claude-Memories/reference/mem.md", {
        path: "Claude-Memories/reference/mem.md",
        title: "Memory",
        tags: [],
        links: [],
        content: "Memory content to index",
        raw: "Memory content to index",
      });

      await mod.indexNote("/v", "v1", "Claude-Memories/reference/mem.md", mockStore);

      // Should have upserted the note and created at least one chunk
      assert.ok(mockStore.upsertNote.mock.calls.length > 0);
      assert.ok(mockStore.upsertChunk.mock.calls.length > 0);
    });

    it("deletes old chunks before re-indexing", async () => {
      // Pre-populate with chunks for this note
      storeChunks.push(
        { id: "mem.md#0", notePath: "Claude-Memories/reference/mem.md", heading: "", content: "Old content 0" },
        { id: "mem.md#1", notePath: "Claude-Memories/reference/mem.md", heading: "", content: "Old content 1" },
      );

      readResults.set("Claude-Memories/reference/mem.md", {
        path: "Claude-Memories/reference/mem.md",
        title: "Memory",
        tags: [],
        links: [],
        content: "New content",
        raw: "New content",
      });

      await mod.indexNote("/v", "v1", "Claude-Memories/reference/mem.md", mockStore);

      // Old chunks should be gone, only 1 new chunk remains
      const remaining = storeChunks.filter((c: any) => c.notePath === "Claude-Memories/reference/mem.md");
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].content, "New content");
      assert.ok(mockStore.deleteChunksForNote.mock.calls.length > 0);
    });

    it("embeds chunks when embedder provided", async () => {
      readResults.set("Claude-Memories/reference/embed.md", {
        path: "Claude-Memories/reference/embed.md",
        title: "Embed",
        tags: [],
        links: [],
        content: "Memory content to embed " + "x".repeat(200),
        raw: "Memory content to embed " + "x".repeat(200),
      });

      const mockEmbedder = {
        embed: async (_t: string) => [0.1, 0.2, 0.3],
        embedBatch: async (_t: string[]) => [[0.1, 0.2, 0.3]],
      };

      await mod.indexNote("/v", "v1", "Claude-Memories/reference/embed.md", mockStore, mockEmbedder);

      // Should have called embedChunks
      assert.ok(embedChunksCalls.length > 0);
      assert.equal(embedChunksCalls[0], "v1");
    });

    it("skips embedding when embedder is null", async () => {
      readResults.set("Claude-Memories/reference/no-embed.md", {
        path: "Claude-Memories/reference/no-embed.md",
        title: "No Embed",
        tags: [],
        links: [],
        content: "Plain content",
        raw: "Plain content",
      });

      const before = embedChunksCalls.length;
      await mod.indexNote("/v", "v1", "Claude-Memories/reference/no-embed.md", mockStore, null);
      assert.equal(embedChunksCalls.length, before);
    });

    it("handles read errors gracefully (does not throw)", async () => {
      readThrows = true;
      // readNote will throw — indexNote should catch and not reject
      await assert.doesNotReject(() => mod.indexNote("/v", "v1", "broken.md", mockStore));
    });
  });
});
