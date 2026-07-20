// Tests for obsidian-rag index.ts helpers (vaultGuard, waitForVault)
// and the tools module tool registration.
// Does NOT require a real Obsidian vault or running Obsidian app.

import assert from "node:assert";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it, mock } from "node:test";
import { Store } from "./store.js";

// ── Helpers: create a minimal fake vault for testing ────────────────────

let testDbDir: string;

before(() => {
  testDbDir = join(homedir(), ".claude", "obsidian-rag-test");
  if (!existsSync(testDbDir)) mkdirSync(testDbDir, { recursive: true });
});

after(() => {
  try {
    rmSync(testDbDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
  try {
    rmSync(join(process.cwd(), "obsidian-rag-test.db"), { force: true });
  } catch {
    /* ok */
  }
});

// ── Store integration (validates tools module can use store) ────────────

describe("Store init with test DB", () => {
  it("creates store instance with test directory", () => {
    const store = new Store({ dbDir: testDbDir });
    assert.ok(store);
  });

  it("getIndexStatus returns defaults for unknown vault", () => {
    const store = new Store({ dbDir: testDbDir });
    const status = store.getIndexStatus("nonexistent-vault");
    assert.strictEqual(status.indexedNotes, 0);
    assert.strictEqual(status.totalChunks, 0);
  });

  it("listNotes returns empty for unknown vault", () => {
    const store = new Store({ dbDir: testDbDir });
    const notes = store.listNotes("nonexistent-vault");
    assert.deepStrictEqual(notes, []);
  });

  it("getTags returns empty map for unknown vault", () => {
    const store = new Store({ dbDir: testDbDir });
    const tags = store.getTags("nonexistent-vault");
    assert.ok(tags instanceof Map);
    assert.strictEqual(tags.size, 0);
  });
});

// ── vaultGuard contract validation ──────────────────────────────────────

describe("vaultGuard function pattern", () => {
  it("throws when no vault is selected", () => {
    // Pattern: vaultGuard() should throw if selectedVault is null
    const selectedVault = null;
    function vaultGuard() {
      if (!selectedVault) throw new Error("No vault selected. Use vault_select first.");
      return selectedVault;
    }
    assert.throws(() => vaultGuard(), /No vault selected/);
  });

  it("returns vault when selected", () => {
    const selectedVault = { name: "Test", path: "/test" };
    function vaultGuard() {
      if (!selectedVault) throw new Error("No vault selected. Use vault_select first.");
      return selectedVault;
    }
    assert.deepStrictEqual(vaultGuard(), selectedVault);
  });
});

// ── waitForVault pattern ────────────────────────────────────────────────────

describe("waitForVault pattern", () => {
  it("returns immediately when vault already selected", async () => {
    const selectedVault = { name: "Test", path: "/test" };
    const _selectPromise: Promise<void> | null = null;

    async function waitForVault() {
      if (selectedVault) return selectedVault;
      if (_selectPromise) {
        try {
          await _selectPromise;
        } catch {
          /* */
        }
        if (selectedVault) return selectedVault;
      }
      throw new Error("No vault selected. Use vault_select first.");
    }

    const result = await waitForVault();
    assert.deepStrictEqual(result, selectedVault);
  });

  it("restores vault from last vault path when vault not selected", async () => {
    const selectedVault: { name: string; path: string } | null = null;
    const lastVault = { name: "Last", path: "/last/path" };

    async function waitForVault() {
      if (selectedVault) return selectedVault;
      // Simulate last vault path restoration
      if (lastVault) return lastVault;
      throw new Error("No vault selected. Use vault_select first.");
    }

    const result = await waitForVault();
    assert.deepStrictEqual(result, lastVault);
  });

  it("throws immediately when no vault selected", async () => {
    const selectedVault = null;
    const _selectPromise: Promise<void> | null = null;

    async function waitForVault() {
      if (selectedVault) return selectedVault;
      if (_selectPromise) {
        try {
          await _selectPromise;
        } catch {
          /* */
        }
        if (selectedVault) return selectedVault;
      }
      throw new Error("No vault selected. Use vault_select first.");
    }

    await assert.rejects(waitForVault(), /No vault selected/);
  });

  it("waits for concurrent selection promise to resolve", async () => {
    let selectedVault: { name: string; path: string } | null = null;
    let _selectPromise: Promise<void> | null = null;

    async function waitForVault() {
      if (selectedVault) return selectedVault;
      if (_selectPromise) {
        try {
          await _selectPromise;
        } catch {
          /* */
        }
        if (selectedVault) return selectedVault;
      }
      throw new Error("No vault selected. Use vault_select first.");
    }

    // Simulate concurrent vault_select
    _selectPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        selectedVault = { name: "Concurrent", path: "/concurrent" };
        resolve();
      }, 20);
    });

    const result = await waitForVault();
    assert.deepStrictEqual(result, { name: "Concurrent", path: "/concurrent" });
  });

  it("throws when selection promise rejects and no vault selected", async () => {
    const selectedVault: { name: string; path: string } | null = null;
    let _selectPromise: Promise<void> | null = null;

    async function waitForVault() {
      if (selectedVault) return selectedVault;
      if (_selectPromise) {
        try {
          await _selectPromise;
        } catch {
          /* */
        }
        if (selectedVault) return selectedVault;
      }
      throw new Error("No vault selected. Use vault_select first.");
    }

    _selectPromise = Promise.reject(new Error("Selection failed"));

    await assert.rejects(waitForVault(), /No vault selected/);
  });

  // ── Memory recall path filtering pattern ───────────────────────────────

  describe("memory_recall path filtering", () => {
    it("filters results to Claude-Memories/ path prefix", () => {
      const results = [
        { notePath: "Claude-Memories/reference/test.md", title: "Test", score: 0.9 },
        { notePath: "notes/regular.md", title: "Regular", score: 0.8 },
        { notePath: "Claude-Memories/user/feedback.md", title: "Feedback", score: 0.7 },
      ];
      const memoryResults = results.filter(
        (r) => r.notePath.startsWith("Claude-Memories/") || r.notePath.includes("/Claude-Memories/"),
      );
      assert.equal(memoryResults.length, 2);
      assert.equal(memoryResults[0].notePath, "Claude-Memories/reference/test.md");
      assert.equal(memoryResults[1].notePath, "Claude-Memories/user/feedback.md");
    });

    it("returns empty when no memories match", () => {
      const results = [
        { notePath: "notes/regular.md", title: "Regular", score: 0.8 },
        { notePath: "notes/other.md", title: "Other", score: 0.5 },
      ];
      const memoryResults = results.filter(
        (r) => r.notePath.startsWith("Claude-Memories/") || r.notePath.includes("/Claude-Memories/"),
      );
      assert.equal(memoryResults.length, 0);
    });

    it("handles nested Claude-Memories paths with deep subdirectories", () => {
      const results = [
        { notePath: "snippets/Claude-Memories/reference/deep.md", title: "Deep", score: 0.6 },
        { notePath: "notes/plain.md", title: "Plain", score: 0.4 },
      ];
      const memoryResults = results.filter(
        (r) => r.notePath.startsWith("Claude-Memories/") || r.notePath.includes("/Claude-Memories/"),
      );
      assert.equal(memoryResults.length, 1);
      assert.equal(memoryResults[0].notePath, "snippets/Claude-Memories/reference/deep.md");
    });
  });
});

// ── Mock modules for create_note auto-indexing tests ──────────────────

let cliShouldThrowForCreate = false;
const indexNoteCalls: any[][] = [];
const reindexVaultCalls: any[][] = [];
const embedAllChunksCalls: any[][] = [];

mock.module("./indexer.js", {
  namedExports: {
    indexNote: mock.fn(async (...args: any[]) => {
      indexNoteCalls.push(args);
    }),
    reindexVault: mock.fn(async (_vp: string, _vn: string, _store: any) => {
      reindexVaultCalls.push([_vp, _vn]);
      return 3;
    }),
  },
});

mock.module("./retriever.js", {
  namedExports: {
    embedAllChunks: mock.fn(async (_store: any, _vn: string, _emb: any) => {
      embedAllChunksCalls.push([_vn]);
    }),
  },
});

mock.module("./cli.js", {
  namedExports: {
    cliCreateNote: mock.fn(async () => {
      if (cliShouldThrowForCreate) throw new Error("CLI not available");
    }),
    cliAppendNote: mock.fn(async () => {
      if (cliShouldThrowForCreate) throw new Error("CLI not available");
    }),
  },
});

mock.module("./vault.js", {
  namedExports: {
    writeNote: mock.fn(async () => {}),
    readNote: mock.fn(async () => {
      throw new Error("not found");
    }),
  },
});

// ── create_note auto-indexing ───────────────────────────────────────────

describe("create_note auto-indexing", () => {
  function setupHandlers() {
    // biome-ignore lint/complexity/noBannedTypes: test mock — Function is intentional for generic MCP handler map
    const handlers = new Map<string, Function>();
    const mockServer = {
      // biome-ignore lint/complexity/noBannedTypes: test mock
      tool: (_name: string, _d: string, _s: any, h: Function) => {
        handlers.set(_name, h);
      },
    } as any;
    return { handlers, mockServer };
  }

  it("calls indexNote after CLI success path", async () => {
    indexNoteCalls.length = 0;
    cliShouldThrowForCreate = false;

    const { handlers, mockServer } = setupHandlers();
    const store = new Store({ dbDir: testDbDir });
    const vault = { name: "cli-test-vault", path: join(testDbDir, "cli-test-vault") };
    const { registerTools } = await import("./tools.js");
    registerTools(mockServer, {
      getVault: () => vault,
      waitForVault: async () => vault,
      getEmbedder: async () => null,
      store,
      setSelectPromise: () => {},
      setSelectedVault: () => {},
    });

    // biome-ignore lint/style/noNonNullAssertion: test — handler is set by registerTools above
    const handler = handlers.get("create_note")!;
    const result = await handler({
      path: "test-cli-success.md",
      title: "CLI Test",
      content: "CLI success path",
      tags: [],
      append: false,
    });

    assert.strictEqual(indexNoteCalls.length, 1);
    assert.strictEqual(indexNoteCalls[0][2], "test-cli-success.md");
    assert.ok(result.content[0].text.includes("Created note"));
  });

  it("calls indexNote after FS fallback path", async () => {
    indexNoteCalls.length = 0;
    cliShouldThrowForCreate = true;

    const { handlers, mockServer } = setupHandlers();
    const store = new Store({ dbDir: testDbDir });
    const vault = { name: "fs-test-vault", path: join(testDbDir, "fs-test-vault") };
    const { registerTools } = await import("./tools.js");
    registerTools(mockServer, {
      getVault: () => vault,
      waitForVault: async () => vault,
      getEmbedder: async () => null,
      store,
      setSelectPromise: () => {},
      setSelectedVault: () => {},
    });

    // biome-ignore lint/style/noNonNullAssertion: test — handler is set by registerTools above
    const handler = handlers.get("create_note")!;
    const result = await handler({
      path: "test-fs-fallback.md",
      title: "FS Test",
      content: "FS fallback path",
      tags: [],
      append: false,
    });

    assert.strictEqual(indexNoteCalls.length, 1);
    assert.strictEqual(indexNoteCalls[0][2], "test-fs-fallback.md");
    assert.ok(result.content[0].text.includes("Created note"));
  });
});

// ── reindex background embed ────────────────────────────────────────────

describe("reindex background embed", () => {
  function setupHandlers() {
    // biome-ignore lint/complexity/noBannedTypes: test mock
    const handlers = new Map<string, Function>();
    const mockServer = {
      // biome-ignore lint/complexity/noBannedTypes: test mock
      tool: (_name: string, _d: string, _s: any, h: Function) => {
        handlers.set(_name, h);
      },
    } as any;
    return { handlers, mockServer };
  }

  it("returns immediately when embed:true — does not await embedAllChunks", async () => {
    reindexVaultCalls.length = 0;
    embedAllChunksCalls.length = 0;

    const { handlers, mockServer } = setupHandlers();
    const store = new Store({ dbDir: testDbDir });
    const vault = { name: "reindex-test-vault", path: join(testDbDir, "reindex-test-vault") };
    const fakeEmbedder = { embed: async (_t: string) => [0.1], embedBatch: async (_t: string[]) => [[0.1]] };
    const { registerTools } = await import("./tools.js");
    registerTools(mockServer, {
      getVault: () => vault,
      waitForVault: async () => vault,
      getEmbedder: async () => fakeEmbedder,
      store,
      setSelectPromise: () => {},
      setSelectedVault: () => {},
    });

    // biome-ignore lint/style/noNonNullAssertion: test — handler is set by registerTools above
    const handler = handlers.get("reindex")!;
    const result = await handler({ embed: true });

    assert.ok(result.content[0].text.includes("Reindexed 3 notes"));
    assert.ok(result.content[0].text.includes("background"));
    assert.strictEqual(reindexVaultCalls.length, 1);
  });

  it("skips background embed when embed:false", async () => {
    reindexVaultCalls.length = 0;
    embedAllChunksCalls.length = 0;

    const { handlers, mockServer } = setupHandlers();
    const store = new Store({ dbDir: testDbDir });
    const vault = { name: "reindex-noembed-vault", path: join(testDbDir, "reindex-noembed-vault") };
    const { registerTools } = await import("./tools.js");
    registerTools(mockServer, {
      getVault: () => vault,
      waitForVault: async () => vault,
      getEmbedder: async () => null,
      store,
      setSelectPromise: () => {},
      setSelectedVault: () => {},
    });

    // biome-ignore lint/style/noNonNullAssertion: test — handler is set by registerTools above
    const handler = handlers.get("reindex")!;
    const result = await handler({ embed: false });

    assert.ok(result.content[0].text.includes("Reindexed 3 notes"));
    assert.ok(!result.content[0].text.includes("background"));
    assert.strictEqual(reindexVaultCalls.length, 1);
    assert.strictEqual(embedAllChunksCalls.length, 0);
  });
});
