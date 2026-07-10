// obsidian-rag MCP server — RAG/memory on an Obsidian vault
//
// Provides semantic search, note CRUD, memory recall, backlink traversal.
// Uses Obsidian CLI for vault discovery, direct filesystem for content,
// SQLite FTS5 for keyword search, and optional local embeddings for semantic search.

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

import { listVaults, getVaultInfo, cliAvailable } from "./cli.js";
import {
  readNote,
  writeNote,
  walkVault,
  getBacklinks,
  aggregateTags,
  readMemories,
  writeMemory,
} from "./vault.js";
import { Store } from "./store.js";
import { indexVault } from "./indexer.js";
import { hybridSearch, type Embedder } from "./retriever.js";
import type { VaultInfo, IndexStatus, SearchResult, NoteContent, NoteMeta, MemoryEntry } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TransformersPipeline = any;

// ── State ─────────────────────────────────────────────────────────────

const DB_DIR = join(homedir(), ".claude", "obsidian-rag");
const store = new Store({ dbDir: DB_DIR });

let selectedVault: VaultInfo | null = null;
let embedder: Embedder | null = null;

// ── Helpers ───────────────────────────────────────────────────────────

function vaultGuard(): VaultInfo {
  if (!selectedVault) throw new Error("No vault selected. Use vault_select first.");
  return selectedVault;
}

// ── Embedder lazy-load ────────────────────────────────────────────────

async function getEmbedder(): Promise<Embedder | null> {
  if (embedder) return embedder;
  try {
    // Dynamic import — transformers.js is optional
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
        for (const text of texts) {
          results.push(await this.embed(text));
        }
        return results;
      },
    };
    return embedder;
  } catch {
    // Transformers.js not installed — semantic search disabled
    return null;
  }
}

// ── Server ────────────────────────────────────────────────────────────

async function main() {
  const server = new McpServer({
    name: "obsidian-rag",
    version: "0.1.0",
  });

  // ══════════════════════════════════════════════════════════════════
  // Tools
  // ══════════════════════════════════════════════════════════════════

  // ── vault_list ──
  server.tool(
    "vault_list",
    "List all known Obsidian vaults. Uses Obsidian CLI if available.",
    {},
    async () => {
      const vaults = await listVaults();
      const cliOk = await cliAvailable();
      if (vaults.length === 0) {
        return {
          content: [{ type: "text", text: cliOk
            ? "No vaults found. Open Obsidian first or check vault configuration."
            : "Obsidian CLI not available. Install Obsidian (https://obsidian.md) for vault discovery, or use vault_select_path to specify a vault directory directly."
          }],
        };
      }
      const lines = vaults.map((v, i) => `${i + 1}. **${v.name}** — \`${v.path}\` (${v.noteCount || "?"} notes)`);
      return {
        content: [{ type: "text", text: `# Obsidian Vaults\n\n${lines.join("\n")}\n\nCLI status: ${cliOk ? "✅ available" : "❌ not found"}` }],
      };
    }
  );

  // ── vault_select ──
  server.tool(
    "vault_select",
    "Select an Obsidian vault by name or path. This must be called before search/read/memory operations.",
    {
      name: z.string().describe("Vault name (from vault_list) or absolute path to vault directory"),
    },
    async ({ name }) => {
      // Check if it's a direct path
      if (existsSync(name) && existsSync(join(name, ".obsidian"))) {
        selectedVault = { name: name.split(/[/\\]/).pop()!, path: name };
      } else {
        // Look up by name
        const vaults = await listVaults();
        const match = vaults.find(v => v.name === name || v.path === name);
        if (!match) {
          // Fallback: try as direct path even without .obsidian marker
          if (existsSync(name)) {
            selectedVault = { name: name.split(/[/\\]/).pop()!, path: name };
          } else {
            return {
              content: [{ type: "text", text: `Vault "${name}" not found. Use vault_list to see available vaults.` }],
              isError: true,
            };
          }
        } else {
          selectedVault = match;
        }
      }

      store.setVault(selectedVault);

      // Start indexing in background
      const idxMsg = await indexVault(selectedVault.path, selectedVault.name, store);
      const status = store.getIndexStatus(selectedVault.name);

      return {
        content: [{ type: "text", text: `✅ Selected vault **${selectedVault.name}**\nPath: \`${selectedVault.path}\`\nIndexed: ${status.indexedNotes} notes, ${status.totalChunks} chunks` }],
      };
    }
  );

  // ── search_notes ──
  server.tool(
    "search_notes",
    "Search notes in the selected Obsidian vault using hybrid search (keyword + optional semantic). Returns ranked results with snippets.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().min(1).max(50).default(20).describe("Max results (1-50)"),
      kind: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid").describe("Search mode"),
    },
    async ({ query, limit, kind }) => {
      const vault = vaultGuard();
      let results: SearchResult[];

      if (kind === "keyword" || !embedder) {
        const { keywordSearch } = await import("./retriever.js");
        results = keywordSearch(store, vault.name, query, limit);
      } else if (kind === "semantic") {
        const emb = await getEmbedder();
        if (!emb) {
          return { content: [{ type: "text", text: "Semantic search unavailable — install @xenova/transformers for local embeddings." }], isError: true };
        }
        const { semanticSearch } = await import("./retriever.js");
        results = await semanticSearch(store, vault.name, query, emb, limit);
      } else {
        const emb = await getEmbedder();
        results = await hybridSearch(store, vault.name, query, emb, limit);
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No results found for "${query}".` }] };
      }

      const lines = results.map((r, i) =>
        `${i + 1}. **[${r.title}](obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent(r.notePath)})** (${r.matchType}, ${(r.score * 100).toFixed(0)}%)\n   > ${r.snippet.slice(0, 200)}`
      );
      return { content: [{ type: "text", text: `# Search: "${query}"\n\n${lines.join("\n\n")}` }] };
    }
  );

  // ── read_note ──
  server.tool(
    "read_note",
    "Read the full content of a note from the selected vault.",
    {
      path: z.string().describe("Note path relative to vault root (e.g. 'folder/Note Name.md')"),
    },
    async ({ path }) => {
      const vault = vaultGuard();
      try {
        const note = await readNote(vault.path, path);
        const lines = [
          `# ${note.title}`,
          `Path: \`${note.path}\``,
          `Tags: ${note.tags.length ? note.tags.map(t => `#${t}`).join(" ") : "(none)"}`,
          `Links: ${note.links.length ? note.links.join(", ") : "(none)"}`,
          ``,
          note.content,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch {
        return { content: [{ type: "text", text: `Note not found: ${path}` }], isError: true };
      }
    }
  );

  // ── list_notes ──
  server.tool(
    "list_notes",
    "List notes in the vault, optionally filtered by directory.",
    {
      directory: z.string().optional().describe("Subdirectory path within vault (optional)"),
    },
    async ({ directory }) => {
      const vault = vaultGuard();
      const notes = store.listNotes(vault.name, directory);
      if (notes.length === 0) {
        return { content: [{ type: "text", text: "No notes found. The vault may not be indexed yet — run reindex." }] };
      }
      const lines = notes.map(n => `- **${n.title}** — \`${n.path}\` ${n.tags.map(t => `#${t}`).join(" ")}`);
      return { content: [{ type: "text", text: `# Notes (${notes.length})\n\n${lines.join("\n")}` }] };
    }
  );

  // ── get_links ──
  server.tool(
    "get_links",
    "Get forward links and backlinks for a note.",
    {
      path: z.string().describe("Note path relative to vault root"),
    },
    async ({ path }) => {
      const vault = vaultGuard();
      try {
        const note = await readNote(vault.path, path);
        const backlinks = await getBacklinks(vault.path, path);
        const fw = note.links.length
          ? note.links.map(l => `- [[${l}]]`)
          : ["(no forward links)"];
        const bw = backlinks.length
          ? backlinks.map(l => `- [[${l.replace(".md", "")}]]`)
          : ["(no backlinks)"];
        return {
          content: [{ type: "text", text: `# Links: ${note.title}\n\n## Forward Links\n${fw.join("\n")}\n\n## Backlinks\n${bw.join("\n")}` }],
        };
      } catch {
        return { content: [{ type: "text", text: `Note not found: ${path}` }], isError: true };
      }
    }
  );

  // ── get_tags ──
  server.tool(
    "get_tags",
    "Get all tags used in the vault with note counts.",
    {},
    async () => {
      const vault = vaultGuard();
      const tags = store.getTags(vault.name);
      if (tags.size === 0) {
        // Fall back to filesystem scan if not indexed
        const fsTags = await aggregateTags(vault.path);
        for (const [tag, count] of fsTags) tags.set(tag, count);
      }
      const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
      const lines = sorted.map(([tag, count]) => `- #${tag} (${count})`);
      return { content: [{ type: "text", text: `# Tags (${sorted.length})\n\n${lines.join("\n")}` }] };
    }
  );

  // ── index_status ──
  server.tool(
    "index_status",
    "Check indexing status for the selected vault.",
    {},
    async () => {
      const vault = vaultGuard();
      const status = store.getIndexStatus(vault.name);
      return {
        content: [{ type: "text", text: `# Index Status: ${vault.name}\n\n- Notes: ${status.indexedNotes}/${status.totalNotes}\n- Chunks: ${status.totalChunks}\n- Embedded: ${status.embeddedChunks}/${status.totalChunks}\n- Last indexed: ${status.lastIndexed || "never"}` }],
      };
    }
  );

  // ── reindex ──
  server.tool(
    "reindex",
    "Force a full reindex of the vault. Re-reads all notes, chunks, and optionally re-embeds.",
    {
      embed: z.boolean().default(false).describe("Also re-embed all chunks (slow, requires transformers.js)"),
    },
    async ({ embed: doEmbed }) => {
      const vault = vaultGuard();
      const count = await indexVault(vault.path, vault.name, store);

      let embedMsg = "";
      if (doEmbed) {
        const emb = await getEmbedder();
        if (emb) {
          const { embedChunks } = await import("./retriever.js");
          let batchCount: number;
          do {
            batchCount = await embedChunks(store, vault.name, emb);
          } while (batchCount > 0);
          embedMsg = ", embeddings updated";
        } else {
          embedMsg = " (embeddings skipped — @xenova/transformers not available)";
        }
      }

      const status = store.getIndexStatus(vault.name);
      return {
        content: [{ type: "text", text: `✅ Reindexed ${count} notes, ${status.totalChunks} chunks${embedMsg}.` }],
      };
    }
  );

  // ── memory_save ──
  server.tool(
    "memory_save",
    "Save a memory entry to the vault's .claude-memories directory. Memories are markdown notes with frontmatter compatible with Claude Code's memory system.",
    {
      id: z.string().describe("Memory ID (kebab-case slug, used as filename)"),
      title: z.string().describe("Short display name"),
      description: z.string().describe("One-line summary"),
      content: z.string().describe("Memory body content (markdown)"),
      type: z.enum(["user", "feedback", "project", "reference"]).default("reference").describe("Memory type"),
      metadata: z.record(z.unknown()).optional().describe("Additional metadata key-value pairs"),
    },
    async ({ id, title, description, content, type, metadata }) => {
      const vault = vaultGuard();
      const now = new Date().toISOString();
      const entry: Omit<MemoryEntry, "path" | "created" | "modified"> = {
        id,
        title,
        description,
        type,
        content,
        metadata: metadata || {},
      };
      const notePath = await writeMemory(vault.path, entry);
      return {
        content: [{ type: "text", text: `✅ Memory saved: **${title}** → \`${notePath}\`` }],
      };
    }
  );

  // ── memory_recall ──
  server.tool(
    "memory_recall",
    "Search through saved memories using hybrid search. Returns relevant memories ranked by score.",
    {
      query: z.string().describe("What to recall — natural language query"),
      limit: z.number().min(1).max(20).default(10).describe("Max memories to return"),
    },
    async ({ query, limit }) => {
      const vault = vaultGuard();
      const memories = await readMemories(vault.path);
      if (memories.length === 0) {
        return { content: [{ type: "text", text: "No memories saved yet. Use memory_save to store memories." }] };
      }

      // Simple keyword match for now (memories are small volume)
      const queryLower = query.toLowerCase();
      const scored = memories.map(m => {
        let score = 0;
        const titleLower = m.title.toLowerCase();
        const descLower = m.description.toLowerCase();
        const contentLower = m.content.toLowerCase();

        if (titleLower.includes(queryLower)) score += 3;
        if (descLower.includes(queryLower)) score += 2;
        for (const word of queryLower.split(/\s+/)) {
          if (word.length < 3) continue;
          if (contentLower.includes(word)) score += 1;
          if (titleLower.includes(word)) score += 2;
        }

        const snippet = m.content.length > 200
          ? m.content.slice(0, 200) + "..."
          : m.content;

        return { memory: m, score, snippet };
      });

      const ranked = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      if (ranked.length === 0) {
        return { content: [{ type: "text", text: `No matching memories for "${query}".` }] };
      }

      const lines = ranked.map(({ memory, score, snippet }, i) =>
        `${i + 1}. **${memory.title}** [${memory.type}] (score: ${score})\n   > ${snippet}\n   Path: \`${memory.path}\``
      );
      return { content: [{ type: "text", text: `# Memory Recall: "${query}"\n\n${lines.join("\n\n")}` }] };
    }
  );

  // ── memory_list ──
  server.tool(
    "memory_list",
    "List all saved memories with their types and descriptions.",
    {},
    async () => {
      const vault = vaultGuard();
      const memories = await readMemories(vault.path);
      if (memories.length === 0) {
        return { content: [{ type: "text", text: "No memories saved yet." }] };
      }
      const byType = new Map<string, MemoryEntry[]>();
      for (const m of memories) {
        const arr = byType.get(m.type) || [];
        arr.push(m);
        byType.set(m.type, arr);
      }
      let out = `# Memories (${memories.length})\n\n`;
      for (const [type, entries] of byType) {
        out += `## ${type}\n`;
        for (const e of entries) {
          out += `- **${e.title}** — ${e.description} (\`${e.id}\`)\n`;
        }
        out += "\n";
      }
      return { content: [{ type: "text", text: out }] };
    }
  );

  // ── create_note ──
  server.tool(
    "create_note",
    "Create or update a note in the vault.",
    {
      path: z.string().describe("Note path relative to vault root (e.g. 'folder/My Note.md')"),
      title: z.string().optional().describe("Note title (sets frontmatter title)"),
      content: z.string().describe("Note body content (markdown)"),
      tags: z.array(z.string()).optional().describe("Tags to set in frontmatter"),
      append: z.boolean().default(false).describe("If true, append to existing note instead of overwriting"),
    },
    async ({ path, title, content, tags, append }) => {
      const vault = vaultGuard();
      let finalContent = content;
      if (append) {
        try {
          const existing = await readNote(vault.path, path);
          finalContent = existing.content + "\n\n" + content;
        } catch {
          // Note doesn't exist — create new
        }
      }
      const fm: Record<string, unknown> = {};
      if (title) fm.title = title;
      if (tags) fm.tags = tags;
      fm.modified = new Date().toISOString();
      await writeNote(vault.path, path, fm, finalContent);
      return {
        content: [{ type: "text", text: `✅ ${append ? "Updated" : "Created"} note: \`${path}\`` }],
      };
    }
  );

  // ══════════════════════════════════════════════════════════════════
  // Resources
  // ══════════════════════════════════════════════════════════════════

  server.resource(
    "vaults",
    "obsidian://vaults",
    { description: "List of known Obsidian vaults" },
    async () => {
      const vaults = await listVaults();
      const lines = vaults.map(v => `- **${v.name}**: \`${v.path}\` (${v.noteCount || "?"} notes)`);
      return {
        contents: [{ text: lines.join("\n"), uri: "obsidian://vaults", mimeType: "text/markdown" }],
      };
    }
  );

  server.resource(
    "tags",
    "obsidian://tags",
    { description: "All tags in selected vault with counts" },
    async () => {
      if (!selectedVault) return { contents: [{ text: "No vault selected.", uri: "obsidian://tags", mimeType: "text/plain" }] };
      const tags = store.getTags(selectedVault.name);
      const lines = [...tags.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => `- #${tag} (${count})`);
      return {
        contents: [{ text: lines.join("\n"), uri: "obsidian://tags", mimeType: "text/markdown" }],
      };
    }
  );

  server.resource(
    "note",
    { uriTemplate: "obsidian://notes/{path}" } as unknown as ResourceTemplate,
    { description: "Read a note by path" },
    async (uri: URL) => {
      if (!selectedVault) return { contents: [{ text: "No vault selected.", uri: uri.href, mimeType: "text/plain" }] };
      const notePath = decodeURIComponent(uri.pathname.split("/notes/")[1] || "");
      try {
        const note = await readNote(selectedVault.path, notePath);
        return {
          contents: [{ text: note.raw, uri: uri.href, mimeType: "text/markdown" }],
        };
      } catch {
        return { contents: [{ text: `Note not found: ${notePath}`, uri: uri.href, mimeType: "text/plain" }] };
      }
    }
  );

  // ── Start ──
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("obsidian-rag MCP server running (stdio)");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
