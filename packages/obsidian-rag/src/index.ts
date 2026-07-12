// obsidian-rag MCP server — RAG/memory on an Obsidian vault
//
// Provides semantic search, note CRUD, memory recall, backlink traversal.
// Interactive tools use Obsidian CLI as source of truth (v1.12+).
// Indexer uses filesystem for bulk performance (CLI too slow for 1000+ notes).

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer, type ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { listVaults } from "./cli.js";
import type { Embedder } from "./retriever.js";
import { Store } from "./store.js";
import { registerTools } from "./tools.js";
import type { VaultInfo } from "./types.js";
import { readNote } from "./vault.js";

// ── State ────────────────────────────────────────────────────────────────

const DB_DIR = join(homedir(), ".claude", "obsidian-rag");
const store = new Store({ dbDir: DB_DIR });

// package.json is ../ from dist/ in dev, ./ in plugin cache (bundle at root)
let pkgPath = new URL("../package.json", import.meta.url);
if (!existsSync(pkgPath)) pkgPath = new URL("./package.json", import.meta.url);
const PKG = (() => {
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("obsidian-rag: failed to parse package.json", { path: String(pkgPath), err: msg });
    return { name: "obsidian-rag", version: "0.0.0" };
  }
})();

let selectedVault: VaultInfo | null = null;
let embedder: Embedder | null = null;

// Selection mutex — prevents race between vault_select and other tools.
let _selectPromise: Promise<void> | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────

function vaultGuard(): VaultInfo {
  if (!selectedVault) throw new Error("No vault selected. Use vault_select first.");
  return selectedVault;
}

/** Await selection if in progress, then guard. Auto-selects last vault when none selected. */
async function waitForVault(): Promise<VaultInfo> {
  if (selectedVault) return selectedVault;

  // ── Auto-select from last vault ──
  if (!selectedVault) {
    const lastPath = store.getLastVaultPath();
    if (lastPath) {
      const vault = store.getVaultByPath(lastPath);
      if (vault && existsSync(vault.path) && existsSync(join(vault.path, ".obsidian"))) {
        selectedVault = vault;
        return selectedVault;
      }
    }
  }

  if (_selectPromise) {
    try {
      await _selectPromise;
    } catch {
      /* selection rejected */
    }
    if (selectedVault) return selectedVault;
  }
  // Poll for up to 5s in case vault_select hasn't started yet (concurrent dispatch)
  for (let i = 0; i < 50; i++) {
    if (_selectPromise) {
      try {
        await _selectPromise;
      } catch {
        /* retry */
      }
      if (selectedVault) return selectedVault;
    }
    if (selectedVault) return selectedVault;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("No vault selected. Use vault_select first.");
}

// ── Embedder lazy-load ───────────────────────────────────────────────────

async function getEmbedder(): Promise<Embedder | null> {
  if (embedder) return embedder;
  try {
    // @ts-expect-error — @xenova/transformers may not be installed
    const { pipeline } = await import("@xenova/transformers");
    const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    embedder = {
      async embed(text: string): Promise<number[]> {
        const result = await pipe(text, { pooling: "mean", normalize: true });
        return Array.from(result.data as Float32Array);
      },
      async embedBatch(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        for (const text of texts) results.push(await this.embed(text));
        return results;
      },
    };
    return embedder;
  } catch {
    return null; // Transformers.js not installed — semantic search disabled
  }
}

// ── Server ───────────────────────────────────────────────────────────────

async function main() {
  const server = new McpServer({
    name: "obsidian-rag",
    version: PKG.version,
  });

  // Tools (extracted to tools.ts)
  registerTools(server, {
    getVault: vaultGuard,
    waitForVault,
    getEmbedder,
    store,
    setSelectPromise: (p) => {
      _selectPromise = p;
    },
    setSelectedVault: (v) => {
      selectedVault = v;
    },
  });

  // ── Resources ──────────────────────────────────────────────────────

  server.resource("vaults", "obsidian://vaults", { description: "List of known Obsidian vaults" }, async () => {
    const vaults = await listVaults();
    const lines = vaults.map((v) => `- **${v.name}**: \`${v.path}\` (${v.noteCount || "?"} notes)`);
    return { contents: [{ text: lines.join("\n"), uri: "obsidian://vaults", mimeType: "text/markdown" }] };
  });

  server.resource("tags", "obsidian://tags", { description: "All tags in selected vault with counts" }, async () => {
    const vault = await waitForVault().catch(() => null);
    if (!vault) return { contents: [{ text: "No vault selected.", uri: "obsidian://tags", mimeType: "text/plain" }] };
    const tags = store.getTags(vault.name);
    const lines = [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => `- #${tag} (${count})`);
    return { contents: [{ text: lines.join("\n"), uri: "obsidian://tags", mimeType: "text/markdown" }] };
  });

  server.resource(
    "note",
    { uriTemplate: "obsidian://notes/{path}" } as unknown as ResourceTemplate,
    { description: "Read a note by path" },
    async (uri: URL) => {
      const vault = await waitForVault().catch(() => null);
      if (!vault) return { contents: [{ text: "No vault selected.", uri: uri.href, mimeType: "text/plain" }] };
      const notePath = decodeURIComponent(uri.pathname.split("/notes/")[1] || "");
      try {
        const note = await readNote(vault.path, notePath);
        return { contents: [{ text: note.raw, uri: uri.href, mimeType: "text/markdown" }] };
      } catch {
        return { contents: [{ text: `Note not found: ${notePath}`, uri: uri.href, mimeType: "text/plain" }] };
      }
    },
  );

  // ── Start ──
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("obsidian-rag MCP server running (stdio)");
}

import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);

if (process.argv[1] === _filename) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
