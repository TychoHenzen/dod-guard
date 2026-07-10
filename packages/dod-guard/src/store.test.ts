import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateId, save, load, findByPath, listAll, remove,
} from "./store.js";
import type { DodDocument } from "./types.js";

// ── Per-test isolation ────────────────────────────────────────────────────

let testStoreDir: string;

beforeEach(() => {
  testStoreDir = mkdtempSync(join(tmpdir(), "dod-store-test-"));
  process.env.DOD_STORE_DIR = testStoreDir;
});

afterEach(() => {
  delete process.env.DOD_STORE_DIR;
  try { rmSync(testStoreDir, { recursive: true, force: true }); } catch { /* ok */ }
});

// ── Helpers ───────────────────────────────────────────────────────────────

function makeDoc(id: string, overrides?: Partial<DodDocument>): DodDocument {
  return {
    id,
    title: "Test DoD",
    goal: "Test goal",
    date: "2026-01-01",
    cwd: process.cwd(),
    markdown_path: join(process.cwd(), "test-dod.md"),
    created_at: "2026-01-01T00:00:00Z",
    sections: { requirements: "Test requirements" },
    roots: [],
    amendments: [],
    ...overrides,
  };
}

// ── generateId ────────────────────────────────────────────────────────────

test("generateId returns a valid UUID v4 string", () => {
  const id = generateId();
  assert.equal(typeof id, "string", "generateId: should return a string");
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.match(id, uuidPattern, `generateId: expected valid UUID v4, got: ${id}`);
});

test("generateId returns unique values across 100 calls", () => {
  const ids = new Set(Array.from({ length: 100 }, () => generateId()));
  assert.equal(ids.size, 100,
    "generateId: 100 calls should produce 100 unique IDs");
});

// ── save + load ───────────────────────────────────────────────────────────

test("save and load a document round-trip", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded, "save+load: document should be found after save");
    assert.equal(loaded!.id, doc.id, "save+load: ID preserved");
    assert.equal(loaded!.title, doc.title, "save+load: title preserved");
    assert.equal(loaded!.goal, doc.goal, "save+load: goal preserved");
    assert.equal(loaded!.sections.requirements, doc.sections.requirements,
      "save+load: sections preserved");
  } finally {
    await remove(doc.id);
  }
});

test("load returns null for nonexistent document", async () => {
  const result = await load("nonexistent-id-12345");
  assert.equal(result, null, "load: nonexistent ID should return null");
});

test("load returns null when store dir is empty", async () => {
  // Store dir is fresh (per-test isolation guarantees empty).
  const result = await load(generateId());
  assert.equal(result, null,
    "load: fresh empty store dir should return null");
});

test("load handles corrupt JSON file gracefully", async () => {
  // Write a file directly that is not valid JSON — bypassing save.
  const id = "bad-json-id";
  const fs = await import("node:fs/promises");
  const { join } = await import("node:path");
  await fs.mkdir(testStoreDir, { recursive: true });
  await fs.writeFile(join(testStoreDir, `${id}.json`), "not valid json {{{", "utf-8");
  const result = await load(id);
  assert.equal(result, null,
    "load: corrupt JSON file should return null without throwing");
});

// ── findByPath ────────────────────────────────────────────────────────────

test("findByPath locates a document by markdown path", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/unique-test-dod.md" });
  await save(doc);
  try {
    const found = await findByPath("/tmp/unique-test-dod.md");
    assert.ok(found, "findByPath: should find by exact path");
    assert.equal(found!.id, doc.id, "findByPath: correct document returned");
  } finally {
    await remove(doc.id);
  }
});

test("findByPath returns null when no documents match", async () => {
  const found = await findByPath("/nonexistent/path/12345.md");
  assert.equal(found, null, "findByPath: unknown path returns null");
});

test("findByPath performs case-insensitive path comparison", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/CaseSensitive.md" });
  await save(doc);
  try {
    const found = await findByPath("/tmp/casesensitive.md");
    assert.ok(found, "findByPath: case difference should still match");
    assert.equal(found!.id, doc.id,
      "findByPath: correct doc returned despite case diff");
  } finally {
    await remove(doc.id);
  }
});

test("findByPath handles store dir with non-JSON files", async () => {
  // Write a .txt file into the store — findByPath should skip it.
  const fs = await import("node:fs/promises");
  await fs.mkdir(testStoreDir, { recursive: true });
  await fs.writeFile(join(testStoreDir, "readme.txt"), "not a dod", "utf-8");
  const found = await findByPath("/tmp/nonexistent.md");
  assert.equal(found, null,
    "findByPath: non-JSON files in store dir should not cause errors");
});

// ── listAll ───────────────────────────────────────────────────────────────

test("listAll returns all saved documents", async () => {
  const id1 = generateId();
  const id2 = generateId();
  await save(makeDoc(id1, { title: "First" }));
  await save(makeDoc(id2, { title: "Second" }));
  try {
    const all = await listAll();
    const found1 = all.find((d) => d.id === id1);
    const found2 = all.find((d) => d.id === id2);
    assert.ok(found1, `listAll: should find first doc (id=${id1})`);
    assert.ok(found2, `listAll: should find second doc (id=${id2})`);
    assert.equal(all.length, 2,
      `listAll: should return exactly 2 docs, got ${all.length}`);
  } finally {
    await remove(id1);
    await remove(id2);
  }
});

test("listAll returns empty array from fresh store", async () => {
  const all = await listAll();
  assert.ok(Array.isArray(all), "listAll: should return an array");
  assert.equal(all.length, 0,
    "listAll: fresh store should return empty array");
});

test("listAll skips corrupt JSON files without failing", async () => {
  const goodId = generateId();
  await save(makeDoc(goodId, { title: "Good" }));
  // Write corrupt file alongside
  const fs = await import("node:fs/promises");
  await fs.writeFile(
    join(testStoreDir, "corrupt.json"),
    "{broken",
    "utf-8",
  );
  try {
    const all = await listAll();
    const good = all.find((d) => d.id === goodId);
    assert.ok(good, "listAll: good doc should still be found despite corrupt neighbor");
  } finally {
    await remove(goodId);
  }
});

// ── remove ────────────────────────────────────────────────────────────────

test("remove deletes a document and returns true", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  const removed = await remove(doc.id);
  assert.equal(removed, true, "remove: should return true on success");
  const after = await load(doc.id);
  assert.equal(after, null, "remove: doc should not be loadable after removal");
});

test("remove returns false for nonexistent document", async () => {
  const removed = await remove("nonexistent-id-98765");
  assert.equal(removed, false, "remove: nonexistent ID should return false");
});

test("remove is idempotent — removing twice returns false on second call", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  const first = await remove(doc.id);
  assert.equal(first, true, "remove: first call should succeed");
  const second = await remove(doc.id);
  assert.equal(second, false, "remove: second call on already-removed should return false");
});

// ── save overwrites ───────────────────────────────────────────────────────

test("save overwrites existing document with same ID", async () => {
  const id = generateId();
  await save(makeDoc(id, { title: "Original" }));
  await save(makeDoc(id, { title: "Updated" }));
  try {
    const loaded = await load(id);
    assert.ok(loaded, "save overwrite: doc should exist");
    assert.equal(loaded!.title, "Updated",
      "save overwrite: title should reflect latest save");
  } finally {
    await remove(id);
  }
});

// ── save edge cases ───────────────────────────────────────────────────────

test("save handles documents with empty roots array", async () => {
  const doc = makeDoc(generateId(), { roots: [] });
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded, "save: empty roots doc should persist");
    assert.deepEqual(loaded!.roots, [],
      "save: empty roots array preserved");
  } finally {
    await remove(doc.id);
  }
});

test("save handles documents with large amendments array", async () => {
  const amendments = Array.from({ length: 100 }, (_, i) => ({
    timestamp: new Date().toISOString(),
    node_path: `0.children.${i}`,
    action: "modified" as const,
    reason: `Amendment #${i} justification text`,
    old_value: { command: `old-cmd-${i}`, predicate: { type: "exit_code" as const, value: i } },
    new_value: { command: `new-cmd-${i}`, predicate: { type: "exit_code" as const, value: i + 1 } },
  }));
  const doc = makeDoc(generateId(), { amendments });
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded, "save: large amendments doc should persist");
    assert.equal(loaded!.amendments.length, 100,
      "save: all 100 amendments preserved");
  } finally {
    await remove(doc.id);
  }
});
