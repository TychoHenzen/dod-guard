// ── Tool registrations for obsidian-rag MCP server ─────────────────────
// Each tool handler is self-contained; extracted from index.ts to keep
// main() focused on server lifecycle, state, and resource definitions.

import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import matter from "gray-matter";
import { z } from "zod";
import type { Store } from "./store.js";
import type { MemoryEntry, VaultInfo } from "./types.js";

// ── Helpers (injected from index.ts) ────────────────────────────────────

interface RegisterOptions {
  /** Returns the currently selected vault, throwing if none selected. */
  getVault: () => VaultInfo;
  /** Returns the selected vault (async) with polling for concurrent selection. */
  waitForVault: () => Promise<VaultInfo>;
  /** Returns the Singleton embedder, lazy-loading if needed (null if unavailable). */
  getEmbedder: () => Promise<import("./retriever.js").Embedder | null>;
  /** SQLite store singleton. */
  store: Store;
  /** Set by vault_select — marks selection complete so other tools unblock. */
  setSelectPromise: (p: Promise<void>) => void;
  /** Updates the module-level selectedVault so guards pass after selection. */
  setSelectedVault: (v: VaultInfo) => void;
}

export function registerTools(server: McpServer, opts: RegisterOptions) {
  const { getVault: _getVault, waitForVault, getEmbedder, store, setSelectPromise, setSelectedVault } = opts;

  // ── vault_list ────────────────────────────────────────────────────
  server.tool("vault_list", "List all known Obsidian vaults. Requires Obsidian app running.", {}, async () => {
    const { listVaults, cliAvailable } = await import("./cli.js");
    const vaults = await listVaults();
    const cliOk = await cliAvailable();
    if (vaults.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: cliOk
              ? "No vaults found. Open Obsidian first or check vault configuration."
              : "Obsidian app not running and could not be started. Is Obsidian installed?",
          },
        ],
      };
    }
    const lines = vaults.map((v, i) => `${i + 1}. **${v.name}** — \`${v.path}\` (${v.noteCount || "?"} notes)`);
    return {
      content: [
        {
          type: "text",
          text: `# Obsidian Vaults\n\n${lines.join("\n")}\n\nCLI status: ${cliOk ? "✅ available" : "❌ not found"}`,
        },
      ],
    };
  });

  // ── vault_select ──────────────────────────────────────────────────
  server.tool(
    "vault_select",
    "Select an Obsidian vault by name or path. This must be called before search/read/memory operations.",
    {
      name: z.string().describe("Vault name (from vault_list) or absolute path to vault directory"),
    },
    async ({ name }) => {
      let resolveSelect!: () => void;
      let rejectSelect!: (e: Error) => void;
      setSelectPromise(
        new Promise<void>((res, rej) => {
          resolveSelect = res;
          rejectSelect = rej;
        }),
      );

      try {
        const { listVaults } = await import("./cli.js");
        const { indexVault } = await import("./indexer.js");
        let vault: VaultInfo;

        if (existsSync(name) && existsSync(join(name, ".obsidian"))) {
          vault = { name: basename(name), path: name };
        } else {
          const vaults = await listVaults();
          const match = vaults.find((v) => v.name === name || v.path === name);
          if (!match) {
            if (existsSync(name)) {
              vault = { name: basename(name), path: name };
            } else {
              rejectSelect?.(new Error("No vault selected."));
              return {
                content: [{ type: "text", text: `Vault "${name}" not found. Use vault_list to see available vaults.` }],
                isError: true,
              };
            }
          } else {
            vault = match;
          }
        }

        store.setVault(vault);
        store.setLastVaultPath(vault.path);
        setSelectedVault(vault);
        resolveSelect?.();

        const _idxMsg = await indexVault(vault.path, vault.name, store);
        const status = store.getIndexStatus(vault.name);
        return {
          content: [
            {
              type: "text",
              text: `✅ Selected vault **${vault.name}**\nPath: \`${vault.path}\`\nIndexed: ${status.indexedNotes} notes, ${status.totalChunks} chunks`,
            },
          ],
        };
      } catch (err) {
        rejectSelect?.(err as Error);
        throw err;
      }
    },
  );

  // ── search_notes ──────────────────────────────────────────────────
  server.tool(
    "search_notes",
    "Search notes in the selected Obsidian vault using hybrid search (keyword + optional semantic). Returns ranked results with snippets.",
    {
      query: z.string().describe("Search query"),
      limit: z.number().min(1).max(50).default(20).describe("Max results (1-50)"),
      kind: z.enum(["keyword", "semantic", "hybrid"]).default("hybrid").describe("Search mode"),
    },
    async ({ query, limit, kind }) => {
      const vault = await waitForVault();
      let results: import("./types.js").SearchResult[];

      if (kind === "keyword") {
        const { keywordSearch } = await import("./retriever.js");
        results = keywordSearch(store, vault.name, query, limit);
      } else if (kind === "semantic") {
        const emb = await getEmbedder();
        if (!emb) {
          return {
            content: [
              {
                type: "text",
                text: "Semantic search unavailable — install @xenova/transformers for local embeddings.",
              },
            ],
            isError: true,
          };
        }
        const { semanticSearch } = await import("./retriever.js");
        results = await semanticSearch(store, vault.name, query, emb, limit);
      } else {
        const emb = await getEmbedder();
        const { hybridSearch } = await import("./retriever.js");
        results = await hybridSearch(store, vault.name, query, emb, limit);
      }

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No results found for "${query}".` }] };
      }
      const lines = results.map(
        (r, i) =>
          `${i + 1}. **[${r.title}](${encodeURIComponent(r.notePath)})** (${r.matchType}, ${(r.score * 100).toFixed(0)}%)\n   > ${r.snippet.slice(0, 200)}`,
      );
      return { content: [{ type: "text", text: `# Search: "${query}"\n\n${lines.join("\n\n")}` }] };
    },
  );

  // ── read_note ─────────────────────────────────────────────────────
  server.tool(
    "read_note",
    "Read the full content of a note from the selected vault.",
    { path: z.string().describe("Note path relative to vault root (e.g. 'folder/Note Name.md')") },
    async ({ path }) => {
      const vault = await waitForVault();
      try {
        const { cliReadNote } = await import("./cli.js");
        const raw = await cliReadNote(vault.name, path);
        const { data: frontmatter, content } = matter(raw);
        const lines = [
          `# ${frontmatter.title || path}`,
          `Path: \`${path}\``,
          `Tags: ${Array.isArray(frontmatter.tags) ? frontmatter.tags.map((t: string) => `#${String(t).replace(/^#/, "")}`).join(" ") : "(none)"}`,
          ``,
          content.trim(),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch {
        return { content: [{ type: "text", text: `Note not found: ${path}` }], isError: true };
      }
    },
  );

  // ── list_notes ────────────────────────────────────────────────────
  server.tool(
    "list_notes",
    "List notes in the vault, optionally filtered by directory.",
    { directory: z.string().optional().describe("Subdirectory path within vault (optional)") },
    async ({ directory }) => {
      const vault = await waitForVault();
      try {
        const { cliListFiles } = await import("./cli.js");
        const files = await cliListFiles(vault.name, directory);
        if (files.length === 0) {
          return { content: [{ type: "text", text: `No .md files found${directory ? ` in "${directory}"` : ""}.` }] };
        }
        const lines = files.map((f) => `- \`${f}\``);
        return { content: [{ type: "text", text: `# Notes (${files.length})\n\n${lines.join("\n")}` }] };
      } catch {
        const notes = store.listNotes(vault.name, directory);
        if (notes.length === 0) {
          return {
            content: [{ type: "text", text: "No notes found. The vault may not be indexed yet — run reindex." }],
          };
        }
        const lines = notes.map((n) => `- **${n.title}** — \`${n.path}\` ${n.tags.map((t) => `#${t}`).join(" ")}`);
        return { content: [{ type: "text", text: `# Notes (${notes.length})\n\n${lines.join("\n")}` }] };
      }
    },
  );

  // ── get_links ─────────────────────────────────────────────────────
  server.tool(
    "get_links",
    "Get forward links and backlinks for a note.",
    { path: z.string().describe("Note path relative to vault root") },
    async ({ path }) => {
      const vault = await waitForVault();
      try {
        const { cliGetBacklinks, cliGetLinks } = await import("./cli.js");
        const backlinks = await cliGetBacklinks(vault.name, path);
        const links = await cliGetLinks(vault.name, path);
        const fw = links.length ? links.map((l) => `- [[${l}]]`) : ["(no forward links)"];
        const bw = backlinks.length ? backlinks.map((l) => `- [[${l.replace(".md", "")}]]`) : ["(no backlinks)"];
        return {
          content: [
            {
              type: "text",
              text: `# Links: ${path}\n\n## Forward Links\n${fw.join("\n")}\n\n## Backlinks\n${bw.join("\n")}`,
            },
          ],
        };
      } catch {
        return { content: [{ type: "text", text: `Note not found: ${path}` }], isError: true };
      }
    },
  );

  // ── get_tags ──────────────────────────────────────────────────────
  server.tool("get_tags", "Get all tags used in the vault with note counts.", {}, async () => {
    const vault = await waitForVault();
    try {
      const { cliGetTags } = await import("./cli.js");
      const tags = await cliGetTags(vault.name);
      const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
      const lines = sorted.map(([tag, count]) => `- #${tag} (${count})`);
      return { content: [{ type: "text", text: `# Tags (${sorted.length})\n\n${lines.join("\n")}` }] };
    } catch {
      const { aggregateTags } = await import("./vault.js");
      const tags = await aggregateTags(vault.path);
      const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
      const lines = sorted.map(([tag, count]) => `- #${tag} (${count})`);
      return { content: [{ type: "text", text: `# Tags (${sorted.length})\n\n${lines.join("\n")}` }] };
    }
  });

  // ── index_status ──────────────────────────────────────────────────
  server.tool("index_status", "Check indexing status for the selected vault.", {}, async () => {
    const vault = await waitForVault();
    const status = store.getIndexStatus(vault.name);
    return {
      content: [
        {
          type: "text",
          text: `# Index Status: ${vault.name}\n\n- Notes: ${status.indexedNotes}/${status.totalNotes}\n- Chunks: ${status.totalChunks}\n- Embedded: ${status.embeddedChunks}/${status.totalChunks}\n- Last indexed: ${status.lastIndexed || "never"}`,
        },
      ],
    };
  });

  // ── reindex ───────────────────────────────────────────────────────
  server.tool(
    "reindex",
    "Force a full reindex of the vault. Re-reads all notes, chunks, and optionally re-embeds.",
    { embed: z.boolean().default(false).describe("Also re-embed all chunks (slow, requires transformers.js)") },
    async ({ embed: doEmbed }) => {
      const vault = await waitForVault();
      const { reindexVault } = await import("./indexer.js");
      const count = await reindexVault(vault.path, vault.name, store);

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
    },
  );

  // ── memory_save ───────────────────────────────────────────────────
  server.tool(
    "memory_save",
    "Save a memory entry to the vault's Claude-Memories directory. Memories are markdown notes with frontmatter compatible with Claude Code's memory system.",
    {
      id: z
        .string()
        .describe(
          "Memory ID (kebab-case slug, used as filename; may contain slashes for nested paths e.g. 'project/memory-name')",
        ),
      title: z.string().describe("Short display name"),
      description: z.string().describe("One-line summary"),
      content: z.string().describe("Memory body content (markdown)"),
      type: z.enum(["user", "feedback", "project", "reference"]).default("reference").describe("Memory type"),
      metadata: z.record(z.unknown()).optional().describe("Additional metadata key-value pairs"),
      overwrite: z.boolean().default(true).describe("If false, refuse to overwrite an existing memory with the same id"),
    },
    async ({ id, title, description, content, type, metadata, overwrite }) => {
      const vault = await waitForVault();
      const { writeMemory } = await import("./vault.js");

      // Check if a memory with this id already exists on disk
      const typeDir = type || "reference";
      const targetPath = join(vault.path, "Claude-Memories", typeDir, `${id}.md`);
      const alreadyExists = existsSync(targetPath);

      if (alreadyExists && !overwrite) {
        return {
          content: [
            {
              type: "text",
              text: `Memory '${id}' already exists and overwrite is disabled. Set overwrite: true to overwrite.`,
            },
          ],
          isError: true,
        };
      }

      const entry: Omit<MemoryEntry, "path" | "created" | "modified"> = {
        id,
        title,
        description,
        type,
        content,
        metadata: metadata || {},
      };
      const notePath = await writeMemory(vault.path, entry);

      if (alreadyExists) {
        return {
          content: [
            {
              type: "text",
              text: `Memory '${id}' already exists and will be overwritten. Set overwrite: false to prevent this.`,
            },
          ],
        };
      }

      return { content: [{ type: "text", text: `✅ Memory saved: **${title}** → \`${notePath}\`` }] };
    },
  );

  // ── memory_recall ─────────────────────────────────────────────────
  server.tool(
    "memory_recall",
    "Search through saved memories using hybrid search. Returns relevant memories ranked by score.",
    {
      query: z.string().describe("What to recall — natural language query"),
      limit: z.number().min(1).max(20).default(10).describe("Max memories to return"),
    },
    async ({ query, limit }) => {
      const vault = await waitForVault();
      const { readMemories } = await import("./vault.js");
      const memories = await readMemories(vault.path);
      if (memories.length === 0) {
        return { content: [{ type: "text", text: "No memories saved yet. Use memory_save to store memories." }] };
      }
      const queryLower = query.toLowerCase();
      const scored = memories.map((m) => {
        let score = 0;
        if (m.title.toLowerCase().includes(queryLower)) score += 3;
        if (m.description.toLowerCase().includes(queryLower)) score += 2;
        for (const word of queryLower.split(/\s+/)) {
          if (word.length < 3) continue;
          if (m.content.toLowerCase().includes(word)) score += 1;
          if (m.title.toLowerCase().includes(word)) score += 2;
        }
        return { memory: m, score, snippet: m.content.length > 200 ? `${m.content.slice(0, 200)}...` : m.content };
      });
      const ranked = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      if (ranked.length === 0) {
        return { content: [{ type: "text", text: `No matching memories for "${query}".` }] };
      }
      const lines = ranked.map(
        ({ memory, score, snippet }, i) =>
          `${i + 1}. **${memory.title}** [${memory.type}] (score: ${score})\n   > ${snippet}\n   Path: \`${memory.path}\``,
      );
      return { content: [{ type: "text", text: `# Memory Recall: "${query}"\n\n${lines.join("\n\n")}` }] };
    },
  );

  // ── memory_list ───────────────────────────────────────────────────
  server.tool("memory_list", "List all saved memories with their types and descriptions.", {}, async () => {
    const vault = await waitForVault();
    const { readMemories } = await import("./vault.js");
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
      for (const e of entries) out += `- **${e.title}** — ${e.description} (\`${e.id}\`)\n`;
      out += "\n";
    }
    return { content: [{ type: "text", text: out }] };
  });

  // ── create_note ───────────────────────────────────────────────────
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
      const vault = await waitForVault();
      try {
        const { cliCreateNote, cliAppendNote } = await import("./cli.js");
        if (append) {
          await cliAppendNote(vault.name, path, content);
        } else {
          await cliCreateNote(vault.name, path, content);
        }
        if (title || (tags && tags.length > 0)) {
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          if (title) {
            await promisify(execFile)(
              "obsidian",
              [`vault=${vault.name}`, "property:set", "name=title", `value=${title}`, `path=${path}`],
              { timeout: 10000, windowsHide: true },
            );
          }
          if (tags && tags.length > 0) {
            await promisify(execFile)(
              "obsidian",
              [
                `vault=${vault.name}`,
                "property:set",
                "name=tags",
                `value=${tags.join(",")}`,
                "type=list",
                `path=${path}`,
              ],
              { timeout: 10000, windowsHide: true },
            );
          }
        }
        return { content: [{ type: "text", text: `✅ ${append ? "Updated" : "Created"} note: \`${path}\`` }] };
      } catch {
        const { readNote, writeNote } = await import("./vault.js");
        let finalContent = content;
        if (append) {
          try {
            const existing = await readNote(vault.path, path);
            finalContent = `${existing.content}\n\n${content}`;
          } catch {
            /* Note doesn't exist — create new */
          }
        }
        const fm: Record<string, unknown> = {};
        if (title) fm.title = title;
        if (tags) fm.tags = tags;
        fm.modified = new Date().toISOString();
        await writeNote(vault.path, path, fm, finalContent);
        return { content: [{ type: "text", text: `✅ ${append ? "Updated" : "Created"} note: \`${path}\`` }] };
      }
    },
  );
}
