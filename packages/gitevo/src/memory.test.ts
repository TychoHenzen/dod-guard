/**
 * Memory bus tests — SQLite storage for gitevo cross-lineage communication.
 */

import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  closeMemoryDb,
  countMessages,
  getBranchSpawnPoint,
  getCheckpointTimestamps,
  getEliteSolutions,
  getMemoryDb,
  getRecentFailures,
  migrateLessons,
  queryMessages,
  recordBranch,
  recordCheckpoint,
  writeMessage,
} from "./memory.js";

// ── Test helpers ──────────────────────────────────────────────────────────

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gitevo-memory-test-"));
  originalCwd = process.cwd();
  // Ensure .evo directory exists
  fs.mkdirSync(path.join(tempDir, ".evo"), { recursive: true });
  // Switch to temp dir so getMemoryDb resolves to tempDir/.evo/memory.db
  process.chdir(tempDir);
});

afterEach(() => {
  closeMemoryDb(tempDir);
  process.chdir(originalCwd);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* cleanup best-effort */
  }
});

// ── getMemoryDb ───────────────────────────────────────────────────────────

describe("getMemoryDb", () => {
  it("creates database file", () => {
    getMemoryDb(tempDir);
    const dbPath = path.join(tempDir, ".evo", "memory.db");
    assert.ok(fs.existsSync(dbPath));
  });

  it("returns same instance on second call (cached)", () => {
    const db1 = getMemoryDb(tempDir);
    const db2 = getMemoryDb(tempDir);
    assert.strictEqual(db1, db2);
  });

  it("creates tables on first open", () => {
    const db = getMemoryDb(tempDir);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string;
    }[];
    const names = tables.map((t) => t.name);
    assert.ok(names.includes("messages"));
    assert.ok(names.includes("checkpoints"));
    assert.ok(names.includes("branches"));
  });
});

// ── writeMessage + queryMessages ──────────────────────────────────────────

describe("writeMessage", () => {
  it("writes and returns row id", () => {
    const id = writeMessage("INSIGHT", "This is a test insight", {}, tempDir);
    assert.ok(id > 0);
  });

  it("message is retrievable", () => {
    writeMessage("ELITE_SOLUTION", "const best = optimize();", {}, tempDir);
    const messages = queryMessages({}, tempDir);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, "ELITE_SOLUTION");
    assert.equal(messages[0].content, "const best = optimize();");
  });

  it("writes with scope", () => {
    writeMessage("FAILURE_SIGNATURE", "NullPointer at line 42", { scope: "auth-module" }, tempDir);
    const messages = queryMessages({ scope: "auth-module" }, tempDir);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].scope, "auth-module");
  });

  it("writes with metadata", () => {
    writeMessage("INSIGHT", "key finding", { metadata: { severity: "high", count: 5 } }, tempDir);
    const messages = queryMessages({}, tempDir);
    assert.deepStrictEqual(messages[0].metadata, { severity: "high", count: 5 });
  });

  it("writes with branch", () => {
    writeMessage("INSIGHT", "discovery", { branch: "feat-42" }, tempDir);
    const messages = queryMessages({}, tempDir);
    assert.equal(messages[0].branch, "feat-42");
  });
});

// ── queryMessages ─────────────────────────────────────────────────────────

describe("queryMessages", () => {
  it("filters by type", () => {
    writeMessage("INSIGHT", "i1", {}, tempDir);
    writeMessage("INSIGHT", "i2", {}, tempDir);
    writeMessage("FAILURE_SIGNATURE", "f1", {}, tempDir);

    const insights = queryMessages({ type: "INSIGHT" }, tempDir);
    assert.equal(insights.length, 2);

    const failures = queryMessages({ type: "FAILURE_SIGNATURE" }, tempDir);
    assert.equal(failures.length, 1);
  });

  it("filters by scope", () => {
    writeMessage("INSIGHT", "a", { scope: "s1" }, tempDir);
    writeMessage("INSIGHT", "b", { scope: "s2" }, tempDir);

    assert.equal(queryMessages({ scope: "s1" }, tempDir).length, 1);
  });

  it("filters by since timestamp", () => {
    writeMessage("INSIGHT", "old", {}, tempDir);
    // Small delay ensures distinct timestamps
    const cutoff = new Date().toISOString();
    writeMessage("INSIGHT", "new", {}, tempDir);

    const recent = queryMessages({ since: cutoff }, tempDir);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].content, "new");
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      writeMessage("INSIGHT", `msg-${i}`, {}, tempDir);
    }
    const results = queryMessages({ limit: 5 }, tempDir);
    assert.equal(results.length, 5);
  });

  it("returns empty for mismatched filters", () => {
    writeMessage("INSIGHT", "test", {}, tempDir);
    assert.equal(queryMessages({ type: "NONEXISTENT" }, tempDir).length, 0);
  });
});

// ── countMessages ─────────────────────────────────────────────────────────

describe("countMessages", () => {
  it("counts all messages", () => {
    writeMessage("INSIGHT", "a", {}, tempDir);
    writeMessage("FAILURE_SIGNATURE", "b", {}, tempDir);
    assert.equal(countMessages(undefined, tempDir), 2);
  });

  it("counts by type", () => {
    writeMessage("INSIGHT", "a", {}, tempDir);
    writeMessage("INSIGHT", "b", {}, tempDir);
    writeMessage("FAILURE_SIGNATURE", "c", {}, tempDir);
    assert.equal(countMessages("INSIGHT", tempDir), 2);
    assert.equal(countMessages("FAILURE_SIGNATURE", tempDir), 1);
  });

  it("returns 0 for empty db", () => {
    assert.equal(countMessages(undefined, tempDir), 0);
  });
});

// ── Convenience helpers ───────────────────────────────────────────────────

describe("getRecentFailures", () => {
  it("returns failures for a scope", () => {
    writeMessage("FAILURE_SIGNATURE", "bad approach", { scope: "auth" }, tempDir);
    writeMessage("FAILURE_SIGNATURE", "also bad", { scope: "auth" }, tempDir);
    writeMessage("INSIGHT", "good idea", { scope: "auth" }, tempDir);

    const failures = getRecentFailures("auth", 10, tempDir);
    assert.equal(failures.length, 2);
    assert.equal(failures[0].type, "FAILURE_SIGNATURE");
  });
});

describe("getEliteSolutions", () => {
  it("returns elite solutions for a scope", () => {
    writeMessage("ELITE_SOLUTION", "best solution", { scope: "search" }, tempDir);
    writeMessage("FAILURE_SIGNATURE", "dead end", { scope: "search" }, tempDir);

    const elites = getEliteSolutions("search", 10, tempDir);
    assert.equal(elites.length, 1);
    assert.equal(elites[0].type, "ELITE_SOLUTION");
  });
});

// ── Checkpoint operations ─────────────────────────────────────────────────

describe("checkpoints", () => {
  it("records and retrieves checkpoints", () => {
    recordCheckpoint("evo-initial", "main", "First checkpoint", tempDir);
    recordCheckpoint("evo-mid", "feat-1", "After feature", tempDir);

    const timestamps = getCheckpointTimestamps(tempDir);
    assert.equal(timestamps.size, 2);
    assert.ok(timestamps.has("evo-initial"));
    assert.ok(timestamps.has("evo-mid"));
  });

  it("upserts checkpoints (INSERT OR REPLACE)", () => {
    recordCheckpoint("evo-dup", "main", "First write", tempDir);
    recordCheckpoint("evo-dup", "main", "Second write", tempDir);

    const timestamps = getCheckpointTimestamps(tempDir);
    assert.equal(timestamps.size, 1);
    assert.ok(timestamps.has("evo-dup"));
  });

  it("empty when no checkpoints", () => {
    assert.equal(getCheckpointTimestamps(tempDir).size, 0);
  });
});

// ── Branch operations ─────────────────────────────────────────────────────

describe("branches", () => {
  it("records branch and retrieves spawn point", () => {
    recordBranch("feat-login", "active", "evo-initial", 0.85, tempDir);
    const spawn = getBranchSpawnPoint("feat-login", tempDir);
    assert.equal(spawn, "evo-initial");
  });

  it("returns null for unknown branch", () => {
    assert.equal(getBranchSpawnPoint("nonexistent", tempDir), null);
  });

  it("upserts branch on conflict", () => {
    recordBranch("feat-dup", "active", "evo-initial", 0.5, tempDir);
    recordBranch("feat-dup", "dead", undefined, 0.3, tempDir);
    // Second call should update status but preserve spawned_from
    const spawn = getBranchSpawnPoint("feat-dup", tempDir);
    assert.equal(spawn, "evo-initial");
  });

  it("handles branch without spawn point", () => {
    recordBranch("orphan", "active", undefined, undefined, tempDir);
    assert.equal(getBranchSpawnPoint("orphan", tempDir), null);
  });
});

// ── migrateLessons ────────────────────────────────────────────────────────

describe("migrateLessons", () => {
  it("returns 0 when lessons.jsonl does not exist", () => {
    const count = migrateLessons(tempDir);
    assert.equal(count, 0);
  });

  it("migrates lessons.jsonl entries", () => {
    const lessonsPath = path.join(tempDir, ".evo", "lessons.jsonl");
    const lessons = [
      JSON.stringify({ content: "Lesson one", branch: "feat-1", timestamp: "2026-01-01" }),
      JSON.stringify({ content: "Lesson two", branch: "feat-2", timestamp: "2026-01-02" }),
    ];
    fs.writeFileSync(lessonsPath, lessons.join("\n"), "utf-8");

    const count = migrateLessons(tempDir);
    assert.equal(count, 2);

    // File should be renamed
    assert.ok(!fs.existsSync(lessonsPath));
    assert.ok(fs.existsSync(`${lessonsPath}.migrated`));

    // Messages should be in the database (all get same migration timestamp,
    // so order within same timestamp is insertion order)
    const messages = queryMessages({ type: "INSIGHT", scope: "gitevo-lessons" }, tempDir);
    assert.equal(messages.length, 2);
    const contents = messages.map((m) => m.content).sort();
    assert.deepStrictEqual(contents, ["Lesson one", "Lesson two"]);
  });

  it("skips empty file", () => {
    const lessonsPath = path.join(tempDir, ".evo", "lessons.jsonl");
    fs.writeFileSync(lessonsPath, "", "utf-8");

    const count = migrateLessons(tempDir);
    assert.equal(count, 0);
    // Empty file is NOT renamed
    assert.ok(fs.existsSync(lessonsPath));
  });

  it("skips malformed lines", () => {
    const lessonsPath = path.join(tempDir, ".evo", "lessons.jsonl");
    const lines = [JSON.stringify({ content: "valid" }), "this is not json", JSON.stringify({ content: "also valid" })];
    fs.writeFileSync(lessonsPath, lines.join("\n"), "utf-8");

    const count = migrateLessons(tempDir);
    assert.equal(count, 2);
  });

  it("is idempotent (returns 0 after migration)", () => {
    const lessonsPath = path.join(tempDir, ".evo", "lessons.jsonl");
    fs.writeFileSync(lessonsPath, JSON.stringify({ content: "test" }), "utf-8");

    assert.equal(migrateLessons(tempDir), 1);
    // File renamed — second call finds nothing
    assert.equal(migrateLessons(tempDir), 0);
  });
});

// ── closeMemoryDb ─────────────────────────────────────────────────────────

describe("closeMemoryDb", () => {
  it("evicts from cache", () => {
    const db = getMemoryDb(tempDir);
    closeMemoryDb(tempDir);
    // After close, a new call should create a fresh connection
    const db2 = getMemoryDb(tempDir);
    assert.notStrictEqual(db, db2);
    closeMemoryDb(tempDir);
  });
});
