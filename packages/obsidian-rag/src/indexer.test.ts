import * as assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const storeNotes: Map<string, any> = new Map();
const storeChunks: any[] = [];
const metaCalls: any[] = [];

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
};

const walkResult: string[] = [];
const readResults = new Map<string, any>();
let readThrows = false;

mock.module("./vault.js", {
  namedExports: {
    walkVault: mock.fn(async (_vp: string) => [...walkResult]),
    readNote: mock.fn(async (_vp: string, file: string) => {
      if (readThrows) throw new Error("read error");
      return readResults.get(file) ?? { path: file, title: file, tags: [], links: [], content: "def", raw: "def" };
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
      assert.equal(await mod.indexVault("/v", "v1", mockStore), 2);
      assert.equal(storeChunks.length, 2);
    });
    it("skips unchanged files", async () => {
      walkResult.push("a.md");
      readResults.set("a.md", { path: "a.md", title: "A", tags: [], links: [], content: "Same", raw: "Same" });
      storeNotes.set("a.md", { path: "a.md", title: "A", content: "Same" });
      assert.equal(await mod.indexVault("/v", "v1", mockStore), 1);
    });
    it("empty vault returns 0", async () => {
      assert.equal(await mod.indexVault("/v", "v1", mockStore), 0);
    });
  });

  describe("reindexVault", () => {
    it("clears and reindexes", async () => {
      walkResult.push("single.md");
      readResults.set("single.md", { path: "single.md", title: "S", tags: [], links: [], content: "X", raw: "X" });
      storeNotes.set("old.md", { path: "old.md", content: "old" });
      storeChunks.push({ id: "old#0" });
      assert.equal(await mod.reindexVault("/v", "v1", mockStore), 1);
      assert.equal(storeNotes.get("old.md"), undefined);
    });
  });
});
