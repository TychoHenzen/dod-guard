// SQLite store for FTS5 keyword index, note metadata cache, and embedding vectors
//
// Uses createRequire for better-sqlite3 (native C++ addon, excluded from esbuild bundle).
// Lazy-loads the database on first access with automatic bootstrap if the package is missing
// (plugin cache copies files from git but does not run npm install).

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Chunk, IndexStatus, NoteMeta, VaultInfo } from "./types.js";

const DB_FILENAME = "obsidian-rag.db";
const req = createRequire(import.meta.url);

// ── Native module loader with auto-bootstrap ──────────────────────────

function loadBetterSqlite3(): any {
  try {
    return req("better-sqlite3");
  } catch (err: any) {
    if (err.code === "MODULE_NOT_FOUND" || err.message?.includes("Cannot find")) {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
      console.error(`[obsidian-rag] better-sqlite3 missing, installing in ${pluginRoot}...`);
      try {
        const { execSync } = req("child_process") as typeof import("node:child_process");
        execSync("npm install --omit=dev --no-audit --no-fund", {
          cwd: pluginRoot,
          stdio: "pipe",
          timeout: 60000,
        });
        console.error("[obsidian-rag] Dependencies installed, retrying...");
        return req("better-sqlite3");
      } catch (installErr: any) {
        throw new Error(
          `better-sqlite3 is required but could not be installed automatically.\n` +
            `Run manually: cd "${pluginRoot}" && npm install --omit=dev\n` +
            `Original error: ${err.message}\n` +
            `Install error: ${installErr.message}`,
        );
      }
    }
    throw err;
  }
}

// ── Store ─────────────────────────────────────────────────────────────

export interface StoreConfig {
  dbDir: string; // e.g. ~/.claude/obsidian-rag/
}

export class Store {
  private _db: any = null;
  private _dbPath: string;
  private _initRan = false;

  constructor(config: StoreConfig) {
    if (!existsSync(config.dbDir)) mkdirSync(config.dbDir, { recursive: true });
    this._dbPath = join(config.dbDir, DB_FILENAME);
    // DB opened lazily on first access — avoids crashing if better-sqlite3
    // not yet installed (plugin cache doesn't run npm install on update).
  }

  /** Lazy DB handle — bootstraps native deps + opens DB on first access. */
  private get db(): any {
    if (!this._db) {
      const Database = loadBetterSqlite3();
      this._db = new Database(this._dbPath);
      this._db.pragma("journal_mode = WAL");
      if (!this._initRan) {
        this._initSchema();
        this._initRan = true;
      }
    }
    return this._db;
  }

  // ── Schema ────────────────────────────────────────────────────────

  private _initSchema(): void {
    const d = this._db;
    if (!d) return;
    d.exec(`
      CREATE TABLE IF NOT EXISTS vaults (
        name TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        note_count INTEGER DEFAULT 0,
        folder_count INTEGER DEFAULT 0,
        last_indexed TEXT
      );

      CREATE TABLE IF NOT EXISTS notes (
        path TEXT NOT NULL,
        vault_name TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        links TEXT NOT NULL DEFAULT '[]',
        frontmatter TEXT NOT NULL DEFAULT '{}',
        created TEXT DEFAULT '',
        modified TEXT DEFAULT '',
        content_hash TEXT DEFAULT '',
        PRIMARY KEY (path, vault_name)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        title,
        content,
        tags,
        content='notes',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
        INSERT INTO notes_fts(notes_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO notes_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        note_path TEXT NOT NULL,
        vault_name TEXT NOT NULL,
        heading TEXT DEFAULT '',
        content TEXT NOT NULL,
        embedding TEXT,
        FOREIGN KEY (note_path, vault_name) REFERENCES notes(path, vault_name)
      );

      CREATE TABLE IF NOT EXISTS index_meta (
        vault_name TEXT PRIMARY KEY,
        total_notes INTEGER DEFAULT 0,
        indexed_notes INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        embedded_chunks INTEGER DEFAULT 0,
        last_indexed TEXT
      );
    `);

    // Migration: add content column if missing (pre-0.1.2 DBs)
    const cols = d.pragma("table_info(notes)") as Array<{ name: string }>;
    if (!cols.some((c) => c.name === "content")) {
      d.exec("ALTER TABLE notes ADD COLUMN content TEXT NOT NULL DEFAULT ''");
    }
  }

  // ── Vault config ─────────────────────────────────────────────────

  setVault(vault: VaultInfo): void {
    const d = this.db;
    d.prepare(`
      INSERT OR REPLACE INTO vaults (name, path, note_count, folder_count, last_indexed)
      VALUES (?, ?, ?, ?, ?)
    `).run(vault.name, vault.path, vault.noteCount || 0, vault.folderCount || 0, new Date().toISOString());
    d.prepare(`INSERT OR IGNORE INTO index_meta (vault_name) VALUES (?)`).run(vault.name);
  }

  getVault(name: string): VaultInfo | null {
    const row = this.db.prepare("SELECT * FROM vaults WHERE name = ?").get(name) as any;
    if (!row) return null;
    return { name: row.name, path: row.path, noteCount: row.note_count ?? 0, folderCount: row.folder_count ?? 0 };
  }

  // ── Notes ────────────────────────────────────────────────────────

  upsertNote(vaultName: string, meta: NoteMeta, content: string, contentHash: string): void {
    const d = this.db;
    d.prepare(`
      INSERT OR REPLACE INTO notes (path, vault_name, title, tags, links, frontmatter, created, modified, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      meta.path,
      vaultName,
      meta.title,
      JSON.stringify(meta.tags),
      JSON.stringify(meta.links),
      JSON.stringify(meta.frontmatter),
      meta.created,
      meta.modified,
      content,
      contentHash,
    );
  }

  getNote(vaultName: string, path: string): (NoteMeta & { content: string }) | null {
    const row = this.db.prepare("SELECT * FROM notes WHERE vault_name = ? AND path = ?").get(vaultName, path) as any;
    if (!row) return null;
    return {
      path: row.path,
      title: row.title,
      tags: JSON.parse(row.tags || "[]"),
      links: JSON.parse(row.links || "[]"),
      backlinks: [],
      frontmatter: JSON.parse(row.frontmatter || "{}"),
      created: row.created,
      modified: row.modified,
      content: row.content || "",
    };
  }

  searchNotesFTS(
    vaultName: string,
    query: string,
    limit = 20,
  ): Array<{
    path: string;
    title: string;
    snippet: string;
    score: number;
  }> {
    const rows = this.db
      .prepare(`
      SELECT n.path, n.title, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet, rank
      FROM notes_fts f
      JOIN notes n ON f.rowid = n.rowid
      WHERE notes_fts MATCH ? AND n.vault_name = ?
      ORDER BY rank
      LIMIT ?
    `)
      .all(query, vaultName, limit) as any[];
    return rows.map((r) => ({
      path: r.path,
      title: r.title,
      snippet: r.snippet || "",
      score: Math.max(0, 1 / (1 + (r.rank || 0))),
    }));
  }

  listNotes(vaultName: string, directory?: string): Array<{ path: string; title: string; tags: string[] }> {
    let rows: any[];
    if (directory) {
      rows = this.db
        .prepare("SELECT path, title, tags FROM notes WHERE vault_name = ? AND path LIKE ? ORDER BY path")
        .all(vaultName, `${directory}%`);
    } else {
      rows = this.db.prepare("SELECT path, title, tags FROM notes WHERE vault_name = ? ORDER BY path").all(vaultName);
    }
    return rows.map((r) => ({ path: r.path, title: r.title, tags: JSON.parse(r.tags || "[]") }));
  }

  getTags(vaultName: string): Map<string, number> {
    const rows = this.db.prepare("SELECT tags FROM notes WHERE vault_name = ?").all(vaultName) as any[];
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of JSON.parse(row.tags || "[]") as string[]) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return counts;
  }

  // ── Chunks ───────────────────────────────────────────────────────

  upsertChunk(chunk: Chunk, vaultName: string): void {
    this.db
      .prepare(`
      INSERT OR REPLACE INTO chunks (id, note_path, vault_name, heading, content, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .run(
        chunk.id,
        chunk.notePath,
        vaultName,
        chunk.heading,
        chunk.content,
        chunk.embedding ? JSON.stringify(chunk.embedding) : null,
      );
  }

  getUnembeddedChunks(vaultName: string, limit = 100): Chunk[] {
    return this.db
      .prepare("SELECT * FROM chunks WHERE vault_name = ? AND embedding IS NULL LIMIT ?")
      .all(vaultName, limit) as Chunk[];
  }

  getChunks(vaultName: string): Chunk[] {
    return this.db.prepare("SELECT * FROM chunks WHERE vault_name = ?").all(vaultName) as Chunk[];
  }

  setEmbedding(chunkId: string, embedding: number[]): void {
    const d = this.db;
    d.prepare("UPDATE chunks SET embedding = ? WHERE id = ?").run(JSON.stringify(embedding), chunkId);
    d.prepare(`
      UPDATE index_meta SET embedded_chunks = (SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL)
      WHERE vault_name = (SELECT vault_name FROM chunks WHERE id = ?)
    `).run(chunkId);
  }

  clearChunks(vaultName: string): void {
    this.db.prepare("DELETE FROM chunks WHERE vault_name = ?").run(vaultName);
  }

  clearNotes(vaultName: string): void {
    this.db.prepare("DELETE FROM notes WHERE vault_name = ?").run(vaultName);
  }

  // ── Index status ─────────────────────────────────────────────────

  getIndexStatus(vaultName: string): IndexStatus {
    const vault = this.getVault(vaultName);
    const meta = this.db.prepare("SELECT * FROM index_meta WHERE vault_name = ?").get(vaultName) as any;
    return {
      vault,
      totalNotes: meta?.total_notes || 0,
      indexedNotes: meta?.indexed_notes || 0,
      totalChunks: meta?.total_chunks || 0,
      embeddedChunks: meta?.embedded_chunks || 0,
      lastIndexed: meta?.last_indexed || null,
      indexing: false,
    };
  }

  setIndexMeta(vaultName: string, data: Partial<IndexStatus>): void {
    const pairs: [string, unknown][] = [];
    if (data.totalNotes !== undefined) pairs.push(["total_notes", data.totalNotes]);
    if (data.indexedNotes !== undefined) pairs.push(["indexed_notes", data.indexedNotes]);
    if (data.totalChunks !== undefined) pairs.push(["total_chunks", data.totalChunks]);
    if (data.embeddedChunks !== undefined) pairs.push(["embedded_chunks", data.embeddedChunks]);
    if (data.lastIndexed !== undefined) pairs.push(["last_indexed", data.lastIndexed]);

    if (pairs.length === 0) return;

    const colNames = pairs.map(([col]) => col);
    const values: unknown[] = [vaultName, ...pairs.map(([, v]) => v)];
    const placeholders = values.map(() => "?").join(", ");

    this.db
      .prepare(`
      INSERT INTO index_meta (vault_name, ${colNames.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(vault_name) DO UPDATE SET ${colNames.map((c) => `${c} = excluded.${c}`).join(", ")}
    `)
      .run(...values);
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  close(): void {
    if (this._db) this._db.close();
  }
}
