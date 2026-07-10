// SQLite store for FTS5 keyword index, note metadata cache, and embedding vectors

import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { NoteMeta, Chunk, IndexStatus, VaultInfo } from "./types.js";

const DB_FILENAME = "obsidian-rag.db";

export interface StoreConfig {
  dbDir: string; // e.g. ~/.claude/obsidian-rag/
}

export class Store {
  private db: Database.Database;

  constructor(private config: StoreConfig) {
    if (!existsSync(config.dbDir)) mkdirSync(config.dbDir, { recursive: true });
    const dbPath = join(config.dbDir, DB_FILENAME);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
  }

  // ── Schema ────────────────────────────────────────────────────────

  private init(): void {
    this.db.exec(`
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

      -- Triggers to keep FTS in sync
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
  }

  // ── Vault config ─────────────────────────────────────────────────

  setVault(vault: VaultInfo): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vaults (name, path, note_count, folder_count, last_indexed)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(vault.name, vault.path, vault.noteCount || 0, vault.folderCount || 0, new Date().toISOString());
    // Ensure index_meta row exists
    this.db.prepare(`INSERT OR IGNORE INTO index_meta (vault_name) VALUES (?)`).run(vault.name);
  }

  getVault(name: string): VaultInfo | null {
    return this.db.prepare("SELECT * FROM vaults WHERE name = ?").get(name) as VaultInfo | null;
  }

  // ── Notes ────────────────────────────────────────────────────────

  upsertNote(vaultName: string, meta: NoteMeta, content: string, contentHash: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notes (path, vault_name, title, tags, links, frontmatter, created, modified, content, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      meta.path,
      vaultName,
      meta.title,
      JSON.stringify(meta.tags),
      JSON.stringify(meta.links),
      JSON.stringify(meta.frontmatter),
      meta.created,
      meta.modified,
      content,
      contentHash
    );
  }

  getNote(vaultName: string, path: string): (NoteMeta & { content: string }) | null {
    const row = this.db.prepare(
      "SELECT * FROM notes WHERE vault_name = ? AND path = ?"
    ).get(vaultName, path) as any;
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

  searchNotesFTS(vaultName: string, query: string, limit = 20): Array<{
    path: string; title: string; snippet: string; score: number;
  }> {
    // FTS5 search with snippet
    const rows = this.db.prepare(`
      SELECT n.path, n.title, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet, rank
      FROM notes_fts f
      JOIN notes n ON f.rowid = n.rowid
      WHERE notes_fts MATCH ? AND n.vault_name = ?
      ORDER BY rank
      LIMIT ?
    `).all(query, vaultName, limit) as any[];
    return rows.map(r => ({
      path: r.path,
      title: r.title,
      snippet: r.snippet || "",
      score: 1 / (1 + (r.rank || 0)), // normalize BM25 rank
    }));
  }

  listNotes(vaultName: string, directory?: string): Array<{ path: string; title: string; tags: string[] }> {
    let rows: any[];
    if (directory) {
      rows = this.db.prepare(
        "SELECT path, title, tags FROM notes WHERE vault_name = ? AND path LIKE ? ORDER BY path"
      ).all(vaultName, `${directory}%`);
    } else {
      rows = this.db.prepare(
        "SELECT path, title, tags FROM notes WHERE vault_name = ? ORDER BY path"
      ).all(vaultName);
    }
    return rows.map(r => ({ path: r.path, title: r.title, tags: JSON.parse(r.tags || "[]") }));
  }

  getTags(vaultName: string): Map<string, number> {
    const rows = this.db.prepare(
      "SELECT tags FROM notes WHERE vault_name = ?"
    ).all(vaultName) as any[];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const tags: string[] = JSON.parse(row.tags || "[]");
      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return counts;
  }

  // ── Chunks ───────────────────────────────────────────────────────

  upsertChunk(chunk: Chunk, vaultName: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO chunks (id, note_path, vault_name, heading, content, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(chunk.id, chunk.notePath, vaultName, chunk.heading, chunk.content, chunk.embedding ? JSON.stringify(chunk.embedding) : null);
  }

  getUnembeddedChunks(vaultName: string, limit = 100): Chunk[] {
    return this.db.prepare(
      "SELECT * FROM chunks WHERE vault_name = ? AND embedding IS NULL LIMIT ?"
    ).all(vaultName, limit) as Chunk[];
  }

  getChunks(vaultName: string): Chunk[] {
    return this.db.prepare(
      "SELECT * FROM chunks WHERE vault_name = ?"
    ).all(vaultName) as Chunk[];
  }

  setEmbedding(chunkId: string, embedding: number[]): void {
    this.db.prepare(
      "UPDATE chunks SET embedding = ? WHERE id = ?"
    ).run(JSON.stringify(embedding), chunkId);
    // Update embedded count
    this.db.prepare(`
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
    const meta = this.db.prepare(
      "SELECT * FROM index_meta WHERE vault_name = ?"
    ).get(vaultName) as any;
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
    this.db.prepare(`
      INSERT INTO index_meta (vault_name, total_notes, indexed_notes, total_chunks, embedded_chunks, last_indexed)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(vault_name) DO UPDATE SET
        total_notes = COALESCE(excluded.total_notes, total_notes),
        indexed_notes = COALESCE(excluded.indexed_notes, indexed_notes),
        total_chunks = COALESCE(excluded.total_chunks, total_chunks),
        embedded_chunks = COALESCE(excluded.embedded_chunks, embedded_chunks),
        last_indexed = COALESCE(excluded.last_indexed, last_indexed)
    `).run(
      vaultName,
      data.totalNotes || 0,
      data.indexedNotes || 0,
      data.totalChunks || 0,
      data.embeddedChunks || 0,
      data.lastIndexed || new Date().toISOString()
    );
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }
}
