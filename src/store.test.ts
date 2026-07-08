import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateId, save, load, findByPath, listAll, remove } from "./store.js";
import type { DodDocument } from "./types.js";

// Isolate test store to a temp directory — prevents contamination from
// leftover files in real ~/.claude/dod-store/ and between test runs.
const testStoreDir = mkdtempSync(join(tmpdir(), "dod-store-test-"));
process.env.DOD_STORE_DIR = testStoreDir;

after(() => {
  delete process.env.DOD_STORE_DIR;
  try { rmSync(testStoreDir, { recursive: true, force: true }); } catch { /* ok */ }
});

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

// ── generateId ──────────────────────────────────────────────────────────

test("generateId returns a valid UUID string", () => {
  const id = generateId();
  assert.equal(typeof id, "string", "should be a string");
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.match(id, uuidPattern, `should be a valid UUID, got: ${id}`);
});

test("generateId returns unique values", () => {
  const ids = new Set(Array.from({ length: 10 }, () => generateId()));
  assert.equal(ids.size, 10, "10 calls should produce 10 unique IDs");
});

// ── save + load ─────────────────────────────────────────────────────────

test("save and load a document round-trip", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded, "should load the saved document");
    assert.equal(loaded!.id, doc.id, "should have same ID");
    assert.equal(loaded!.title, doc.title, "should have same title");
    assert.equal(loaded!.goal, doc.goal, "should have same goal");
    assert.equal(loaded!.sections.requirements, doc.sections.requirements, "should preserve sections");
  } finally {
    await remove(doc.id);
  }
});

test("load returns null for nonexistent document", async () => {
  const result = await load("nonexistent-id-12345");
  assert.equal(result, null, "should return null for missing ID");
});

// ── findByPath ───────────────────────────────────────────────────────────

test("findByPath locates a document by markdown path", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/unique-test-dod.md" });
  await save(doc);
  try {
    const found = await findByPath("/tmp/unique-test-dod.md");
    assert.ok(found, "should find by path");
    assert.equal(found!.id, doc.id, "should return correct document");
  } finally {
    await remove(doc.id);
  }
});

test("findByPath returns null when no documents match", async () => {
  const found = await findByPath("/nonexistent/path/12345.md");
  assert.equal(found, null, "should return null for unknown path");
});

test("findByPath performs case-insensitive path comparison", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/CaseSensitive.md" });
  await save(doc);
  try {
    const found = await findByPath("/tmp/casesensitive.md");
    assert.ok(found, "should find despite case difference");
    assert.equal(found!.id, doc.id, "should return correct document");
  } finally {
    await remove(doc.id);
  }
});

// ── listAll ──────────────────────────────────────────────────────────────

test("listAll returns all saved documents", async () => {
  const id1 = generateId();
  const id2 = generateId();
  const doc1 = makeDoc(id1, { title: "First" });
  const doc2 = makeDoc(id2, { title: "Second" });
  await save(doc1);
  await save(doc2);
  try {
    const all = await listAll();
    const found1 = all.find((d: DodDocument) => d.id === id1);
    const found2 = all.find((d: DodDocument) => d.id === id2);
    assert.ok(found1, `should find first doc with ID: ${id1}`);
    assert.ok(found2, `should find second doc with ID: ${id2}`);
  } finally {
    await remove(id1);
    await remove(id2);
  }
});

test("listAll returns empty array from fresh temp store", async () => {
  const all = await listAll();
  assert.ok(Array.isArray(all), "should return an array");
  assert.equal(all.length, 0, "fresh temp store should be empty");
});

// ── remove ───────────────────────────────────────────────────────────────

test("remove deletes a document", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  const removed = await remove(doc.id);
  assert.equal(removed, true, "should return true on successful removal");
  const after = await load(doc.id);
  assert.equal(after, null, "should not be loadable after removal");
});

test("remove returns false for nonexistent document", async () => {
  const removed = await remove("nonexistent-id-98765");
  assert.equal(removed, false, "should return false for missing ID");
});

// ── save overwrites ─────────────────────────────────────────────────────

test("save overwrites existing document with same ID", async () => {
  const id = generateId();
  const doc1 = makeDoc(id, { title: "Original" });
  const doc2 = makeDoc(id, { title: "Updated" });
  await save(doc1);
  await save(doc2);
  try {
    const loaded = await load(id);
    assert.equal(loaded!.title, "Updated", "should load updated version");
  } finally {
    await remove(id);
  }
});
