import * as assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";
import * as path from "node:path";

// ── Mock state ────────────────────────────────────────────────────────────

let fsExistsSync = true;
let readdirReturns: Record<string, any[]> = {};
let readFileMap: Record<string, string> = {};
let writtenFiles: Record<string, string> = {};
let mkdirCalled: string[] = [];

mock.module("node:fs/promises", {
  namedExports: {
    mkdir: mock.fn(async (dir: string, _opts?: any) => { mkdirCalled.push(dir); }),
    readdir: mock.fn(async (dir: string, _opts?: any) => {
      const key = String(dir).replace(/\\/g, "/");
      return [...(readdirReturns[key] ?? [])];
    }),
    readFile: mock.fn(async (p: string, _enc?: string) => {
      const key = String(p).replace(/\\/g, "/");
      return readFileMap[key] ?? "";
    }),
    writeFile: mock.fn(async (p: string, content: string, _enc?: string) => { writtenFiles[String(p).replace(/\\/g, "/")] = content; }),
  },
});

mock.module("node:fs", {
  namedExports: {
    existsSync: mock.fn((_p: string) => fsExistsSync),
  },
});

// gray-matter mock
function parseFM(raw: string): { data: Record<string, unknown>; content: string } {
  const lines = raw.split("\n");
  if (lines[0]?.trim() === "---") {
    const endIdx = lines.indexOf("---", 1);
    if (endIdx > 0) {
      const fmLines = lines.slice(1, endIdx);
      const fm: Record<string, unknown> = {};
      for (const l of fmLines) {
        const colon = l.indexOf(":");
        if (colon > 0) {
          const key = l.slice(0, colon).trim();
          let val: unknown = l.slice(colon + 1).trim();
          if (val === "true") val = true;
          else if (val === "false") val = false;
          else if (/^\d+$/.test(val as string)) val = Number(val);
          fm[key] = val;
        }
      }
      return { data: fm, content: lines.slice(endIdx + 1).join("\n").trim() };
    }
  }
  return { data: {}, content: raw.trim() };
}

const matterMock = mock.fn(parseFM);
(matterMock as any).stringify = mock.fn((content: string, fm: Record<string, unknown>) => {
  const fmLines = Object.entries(fm)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => Array.isArray(v) ? `${k}:\n  - ${(v as string[]).join("\n  - ")}` : `${k}: ${v}`)
    .join("\n");
  return `---\n${fmLines}\n---\n${content}`;
});

mock.module("gray-matter", { defaultExport: matterMock });

// Helper: set entries for a directory path
function setDir(dir: string, entries: any[]) {
  readdirReturns[dir.replace(/\\/g, "/")] = entries;
}
function setFile(p: string, content: string) {
  readFileMap[p.replace(/\\/g, "/")] = content;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("vault", () => {
  let mod: any;

  beforeEach(async () => {
    fsExistsSync = true;
    readdirReturns = {};
    readFileMap = {};
    writtenFiles = {};
    mkdirCalled = [];
    mod = await import("./vault.js");
  });

  describe("extractWikilinks", () => {
    it("empty array", () => assert.deepStrictEqual(mod.extractWikilinks("text"), []));
    it("simple", () => assert.deepStrictEqual(mod.extractWikilinks("[[Note]]"), ["Note"]));
    it("deduplicates", () => assert.deepStrictEqual(mod.extractWikilinks("[[A]] [[B]] [[A]]"), ["A", "B"]));
    it("strips heading anchors", () => assert.deepStrictEqual(mod.extractWikilinks("[[Note#section]]"), ["Note"]));
    it("strips aliases", () => assert.deepStrictEqual(mod.extractWikilinks("[[Note|display]]"), ["Note"]));
    it("strips anchor+alias", () => assert.deepStrictEqual(mod.extractWikilinks("[[Note#section|display]]"), ["Note"]));
    it("trims whitespace", () => assert.deepStrictEqual(mod.extractWikilinks("[[  spaced  ]]"), ["spaced"]));
    it("rejects #-only target", () => assert.deepStrictEqual(mod.extractWikilinks("[[#section]]"), []));
  });

  describe("memoryDir", () => {
    it("returns Claude-Memories path", () => {
      const r = mod.memoryDir("/v");
      assert.ok(r.includes("Claude-Memories"));
    });
  });

  describe("writeNote", () => {
    it("writes with frontmatter", async () => {
      await mod.writeNote("/v", "notes/t.md", { title: "Test", tags: ["a"] }, "Hello");
      const p = Object.keys(writtenFiles)[0];
      assert.ok(p);
      assert.ok(writtenFiles[p].includes("title: Test"));
    });

    it("creates dir if missing", async () => {
      fsExistsSync = false;
      await mod.writeNote("/v", "sub/n.md", {}, "c");
      assert.ok(mkdirCalled.length > 0);
    });
  });

  describe("walkVault", () => {
    it("collects .md files only", async () => {
      setDir("/v", [
        { name: "a.md", isDirectory: () => false, isFile: () => true },
        { name: "img.png", isDirectory: () => false, isFile: () => true },
      ]);
      assert.deepStrictEqual(await mod.walkVault("/v"), ["a.md"]);
    });

    it("skips hidden dirs", async () => {
      setDir("/v", [
        { name: "visible.md", isDirectory: () => false, isFile: () => true },
        { name: ".obsidian", isDirectory: () => true, isFile: () => false },
      ]);
      assert.deepStrictEqual(await mod.walkVault("/v"), ["visible.md"]);
    });

    it("empty vault", async () => {
      setDir("/v", []);
      assert.deepStrictEqual(await mod.walkVault("/v"), []);
    });

    it("recurses into subdirectories", async () => {
      setDir("/v", [
        { name: "sub", isDirectory: () => true, isFile: () => false },
      ]);
      setDir("/v/sub", [
        { name: "nested.md", isDirectory: () => false, isFile: () => true },
      ]);
      const result = await mod.walkVault("/v");
      assert.deepStrictEqual(result, ["sub\\nested.md"]);
    });
  });

  describe("readNote", () => {
    it("parses frontmatter", async () => {
      setFile("/v/t.md", "---\ntitle: My Note\ntags: dev, ops\n---\nContent here");
      const note = await mod.readNote("/v", "t.md");
      assert.equal(note.title, "My Note");
      assert.equal(note.content, "Content here");
      assert.deepStrictEqual(note.tags, ["dev", "ops"]);
    });

    it("handles note without frontmatter", async () => {
      setFile("/v/plain.md", "Just plain text");
      const note = await mod.readNote("/v", "plain.md");
      assert.equal(note.content, "Just plain text");
      assert.deepStrictEqual(note.tags, []);
    });
  });

  describe("readNoteMeta", () => {
    it("returns metadata", async () => {
      setFile("/v/meta.md", "---\ntitle: Meta\n---\nbody");
      const meta = await mod.readNoteMeta("/v", "meta.md");
      assert.equal(meta.title, "Meta");
      assert.equal(meta.path, "meta.md");
    });
  });

  describe("readMemories", () => {
    it("empty when dir missing", async () => {
      fsExistsSync = false;
      assert.deepStrictEqual(await mod.readMemories("/v"), []);
    });

    it("reads memory files from type subdirectories", async () => {
      fsExistsSync = true;
      setDir("/v/Claude-Memories", [
        { name: "reference", isDirectory: () => true, isFile: () => false },
      ]);
      // Inside Claude-Memories/reference/:
      setDir("/v/Claude-Memories/reference", [
        { name: "my-mem.md", isDirectory: () => false, isFile: () => true },
      ]);
      setFile("/v/Claude-Memories/reference/my-mem.md",
        "---\nname: my-mem\ndescription: A test memory\ntype: reference\n---\nMemory body");
      const memories = await mod.readMemories("/v");
      assert.equal(memories.length, 1);
      assert.equal(memories[0].id, "my-mem");
      assert.equal(memories[0].type, "reference");
      assert.equal(memories[0].content, "Memory body");
    });
  });

  describe("writeMemory", () => {
    it("writes to type subdir", async () => {
      await mod.writeMemory("/v", {
        id: "mem-1", title: "Mem", description: "d", type: "reference",
        content: "body", metadata: {},
      });
      const p = Object.keys(writtenFiles)[0];
      assert.ok(p);
      assert.ok(p.includes("reference"));
      assert.ok(p.includes("mem-1"));
    });
  });

  describe("aggregateTags", () => {
    it("empty vault", async () => {
      setDir("/v", []);
      assert.equal((await mod.aggregateTags("/v")).size, 0);
    });

    it("counts tags across files", async () => {
      setDir("/v", [
        { name: "a.md", isDirectory: () => false, isFile: () => true },
        { name: "b.md", isDirectory: () => false, isFile: () => true },
      ]);
      setFile("/v/a.md", "---\ntags: dev, ops\n---\n");
      setFile("/v/b.md", "---\ntags: dev, cli\n---\n");
      const tags = await mod.aggregateTags("/v");
      assert.equal(tags.get("dev"), 2);
      assert.equal(tags.get("ops"), 1);
      assert.equal(tags.get("cli"), 1);
    });
  });
});
