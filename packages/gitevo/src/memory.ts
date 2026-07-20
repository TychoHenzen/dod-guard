/**
 * SQLite memory bus for cross-lineage communication between evomcp candidates.
 *
 * Provides persistent storage for messages (ELITE_SOLUTION, FAILURE_SIGNATURE,
 * INSIGHT, PROGRESS, CONSTRAINT_VIOLATION), checkpoints, and branch metadata
 * in a shared .evo/memory.db database.
 *
 * WAL mode enabled for concurrent access. Cached per working directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import DatabaseConstructor from "better-sqlite3";

type Database = DatabaseConstructor.Database;

// ── Types ─────────────────────────────────────────────────────────────────

export interface Message {
  id: number;
  type: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  branch: string;
  timestamp: string;
}

interface MessageRow {
  id: number;
  type: string;
  scope: string;
  content: string;
  metadata: string;
  branch: string;
  timestamp: string;
}

export interface QueryOptions {
  type?: string;
  scope?: string;
  limit?: number;
  since?: string;
}

export interface WriteOptions {
  scope?: string;
  metadata?: Record<string, unknown>;
  branch?: string;
}

// ── Database cache ────────────────────────────────────────────────────────

const dbCache = new Map<string, Database>();

// ── Schema ────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    branch TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL UNIQUE,
    branch TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    spawned_from TEXT,
    score REAL,
    timestamp TEXT NOT NULL
  );
`;

// ── Database access ───────────────────────────────────────────────────────

/**
 * Open (or create) the memory database at .evo/memory.db.
 *
 * Creates the .evo/ directory and tables if they don't exist.
 * Enables WAL mode and foreign keys.
 * Cached — singleton per cwd.
 */
export function getMemoryDb(cwd?: string): Database {
  // Normalize to OS-native path — git rev-parse --show-toplevel returns
  // POSIX-style paths (e.g. /c/Users/...) on Windows, while process.cwd()
  // returns native (C:\Users\...). Without normalization, cache key mismatch
  // opens two separate connections to the same file → EBUSY on close.
  const resolvedCwd = path.normalize(cwd ?? process.cwd());
  const cached = dbCache.get(resolvedCwd);
  if (cached) return cached;

  const evoDir = path.join(resolvedCwd, ".evo");
  fs.mkdirSync(evoDir, { recursive: true });

  const dbPath = path.join(evoDir, "memory.db");
  const db = new DatabaseConstructor(dbPath);

  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);

  // Migration: add unique index on branches.name for upsert support
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_name ON branches(name)");
  } catch {
    // Older SQLite doesn't support IF NOT EXISTS for indexes — already present
  }

  dbCache.set(resolvedCwd, db);
  return db;
}

/**
 * Close the cached database handle and evict it from the cache.
 *
 * Must be called before removing .evo/ on Windows — an open handle
 * blocks rmSync with EBUSY.
 */
export function closeMemoryDb(cwd?: string): void {
  const resolvedCwd = path.normalize(cwd ?? process.cwd());
  const db = dbCache.get(resolvedCwd);
  if (db) {
    db.close();
    dbCache.delete(resolvedCwd);
  }
}

// ── Message operations ───────────────────────────────────────────────────

/**
 * Insert a message into the memory bus.
 *
 * @param type  Message type (ELITE_SOLUTION, FAILURE_SIGNATURE, INSIGHT, etc.)
 * @param content  Message body
 * @param opts  Optional: scope, metadata (JSON-serialised), branch
 * @returns  The auto-generated row id
 */
export function writeMessage(type: string, content: string, opts?: WriteOptions, cwd?: string): number {
  const db = getMemoryDb(cwd);
  const timestamp = new Date().toISOString();
  const scope = opts?.scope ?? "";
  const metadata = JSON.stringify(opts?.metadata ?? {});
  const branch = opts?.branch ?? "";

  const result = db
    .prepare(
      `INSERT INTO messages (type, scope, content, metadata, branch, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(type, scope, content, metadata, branch, timestamp);

  return Number(result.lastInsertRowid);
}

/**
 * Query messages with optional filters.
 *
 * Ordered by timestamp DESC. Default limit 50.
 */
export function queryMessages(opts: QueryOptions, cwd?: string): Message[] {
  const db = getMemoryDb(cwd);
  const conditions: string[] = [];
  const params: unknown[] = [];
  const limit = opts.limit ?? 50;

  if (opts.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts.scope) {
    conditions.push("scope = ?");
    params.push(opts.scope);
  }
  if (opts.since) {
    conditions.push("timestamp >= ?");
    params.push(opts.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM messages ${where} ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as MessageRow[];

  return rows.map(rowToMessage);
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    type: row.type,
    scope: row.scope,
    content: row.content,
    metadata: JSON.parse(row.metadata || "{}") as Record<string, unknown>,
    branch: row.branch,
    timestamp: row.timestamp,
  };
}

/**
 * Count messages, optionally filtered by type.
 */
export function countMessages(type?: string, cwd?: string): number {
  const db = getMemoryDb(cwd);
  if (type) {
    const row = db.prepare("SELECT COUNT(*) as count FROM messages WHERE type = ?").get(type) as { count: number };
    return row.count;
  }
  const row = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
  return row.count;
}

/**
 * Convenience: get recent FAILURE_SIGNATURE messages for a scope.
 */
export function getRecentFailures(scope: string, limit?: number, cwd?: string): Message[] {
  return queryMessages({ type: "FAILURE_SIGNATURE", scope, limit }, cwd);
}

/**
 * Convenience: get recent ELITE_SOLUTION messages for a scope.
 */
export function getEliteSolutions(scope: string, limit?: number, cwd?: string): Message[] {
  return queryMessages({ type: "ELITE_SOLUTION", scope, limit }, cwd);
}

// ── Checkpoint operations ────────────────────────────────────────────────

/**
 * Record a checkpoint. Upserts — if the tag already exists, it is replaced.
 */
export function recordCheckpoint(tag: string, branch: string, description?: string, cwd?: string): void {
  const db = getMemoryDb(cwd);
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO checkpoints (tag, branch, description, timestamp)
     VALUES (?, ?, ?, ?)`,
  ).run(tag, branch, description ?? "", timestamp);
}

/**
 * Read all checkpoint timestamps from the checkpoints table.
 * Returns a Map<tag, ISO timestamp> for chronological sorting.
 */
export function getCheckpointTimestamps(cwd?: string): Map<string, string> {
  const db = getMemoryDb(cwd);
  const rows = db.prepare("SELECT tag, timestamp FROM checkpoints").all() as { tag: string; timestamp: string }[];
  return new Map(rows.map((r) => [r.tag, r.timestamp]));
}

// ── Branch operations ─────────────────────────────────────────────────────

/**
 * Record a branch entry.
 */
export function recordBranch(name: string, status: string, spawnedFrom?: string, score?: number, cwd?: string): void {
  const db = getMemoryDb(cwd);
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO branches (name, status, spawned_from, score, timestamp)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       status = excluded.status,
       spawned_from = COALESCE(excluded.spawned_from, branches.spawned_from),
       score = COALESCE(excluded.score, branches.score),
       timestamp = excluded.timestamp`,
  ).run(name, status, spawnedFrom ?? null, score ?? null, timestamp);
}

/**
 * Look up a branch's spawn point checkpoint tag from the branches table.
 *
 * Returns the full tag name (e.g. "evo-initial") or null if the branch
 * has no spawn record.
 */
export function getBranchSpawnPoint(branchName: string, cwd?: string): string | null {
  const db = getMemoryDb(cwd);
  const row = db.prepare("SELECT spawned_from FROM branches WHERE name = ? ORDER BY id DESC LIMIT 1").get(branchName) as
    | { spawned_from: string | null }
    | undefined;
  return row?.spawned_from ?? null;
}

// ── Migration ─────────────────────────────────────────────────────────────

/**
 * Migrate existing .evo/lessons.jsonl entries into the memory bus.
 *
 * Reads each lesson entry, inserts it as a type "INSIGHT" message,
 * then renames lessons.jsonl → lessons.jsonl.migrated.
 *
 * @returns  Number of lessons migrated (0 if file missing or empty).
 * Idempotent: returns 0 if lessons.jsonl doesn't exist.
 */
export function migrateLessons(cwd?: string): number {
  const resolvedCwd = path.normalize(cwd ?? process.cwd());
  const lessonsFile = path.join(resolvedCwd, ".evo", "lessons.jsonl");

  if (!fs.existsSync(lessonsFile)) {
    return 0;
  }

  const content = fs.readFileSync(lessonsFile, "utf-8").trim();
  if (!content) {
    // Empty file — nothing to migrate. Don't rename; callers may still need it.
    return 0;
  }

  const lines = content.split("\n").filter((l) => l.trim());
  const db = getMemoryDb(resolvedCwd);
  const insert = db.prepare(
    `INSERT INTO messages (type, scope, content, metadata, branch, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const timestamp = new Date().toISOString();
  let count = 0;

  const tx = db.transaction(() => {
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const metadata = JSON.stringify({ migratedFrom: "lessons.jsonl", originalTimestamp: entry.timestamp ?? null });
        insert.run("INSIGHT", "gitevo-lessons", entry.content ?? "", metadata, entry.branch ?? "", timestamp);
        count++;
      } catch {
        // Skip malformed lines
      }
    }

    // Rename after all inserts succeed within the transaction
    fs.renameSync(lessonsFile, `${lessonsFile}.migrated`);
  });

  tx();

  return count;
}
