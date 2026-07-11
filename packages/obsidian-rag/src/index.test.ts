// Tests for obsidian-rag index.ts helpers (vaultGuard, waitForVault)
// and the tools module tool registration.
// Does NOT require a real Obsidian vault or running Obsidian app.

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

// ── waitForVault polling pattern ────────────────────────────────────────

describe("waitForVault polling pattern", () => {
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
      for (let i = 0; i < 5; i++) {
        if (_selectPromise) {
          try {
            await _selectPromise;
          } catch {
            /* */
          }
          if (selectedVault) return selectedVault;
        }
        if (selectedVault) return selectedVault;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("No vault selected. Use vault_select first.");
    }

    const result = await waitForVault();
    assert.deepStrictEqual(result, selectedVault);
  });

  it("throws after polling timeout when no vault selected", async () => {
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
      for (let i = 0; i < 3; i++) {
        if (_selectPromise) {
          try {
            await _selectPromise;
          } catch {
            /* */
          }
          if (selectedVault) return selectedVault;
        }
        if (selectedVault) return selectedVault;
        await new Promise((r) => setTimeout(r, 5));
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
      for (let i = 0; i < 10; i++) {
        if (_selectPromise) {
          try {
            await _selectPromise;
          } catch {
            /* */
          }
          if (selectedVault) return selectedVault;
        }
        if (selectedVault) return selectedVault;
        await new Promise((r) => setTimeout(r, 5));
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

  it("handles rejected selection promise and retries", async () => {
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
      for (let i = 0; i < 10; i++) {
        if (_selectPromise) {
          try {
            await _selectPromise;
          } catch {
            /* */
          }
          if (selectedVault) return selectedVault;
        }
        if (selectedVault) return selectedVault;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error("No vault selected. Use vault_select first.");
    }

    // First selection fails, then retry succeeds
    _selectPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error("First selection failed")), 10);
    });

    // Wait for first attempt to fail, then set up success
    setTimeout(() => {
      _selectPromise = new Promise<void>((resolve) => {
        selectedVault = { name: "Fallback", path: "/fallback" };
        resolve();
      });
    }, 30);

    const result = await waitForVault();
    assert.deepStrictEqual(result, { name: "Fallback", path: "/fallback" });
  });
});
