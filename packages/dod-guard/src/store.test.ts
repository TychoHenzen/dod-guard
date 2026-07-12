import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  findByPath,
  generateId,
  listAll,
  listAllRaw,
  listLegacyCount,
  load,
  loadRaw,
  migrateDoc,
  remove,
  save,
} from "./store.js";
import type { DodDocument } from "./types.js";

let testStoreDir: string;

beforeEach(() => {
  testStoreDir = mkdtempSync(join(tmpdir(), "dod-store-test-"));
  process.env.DOD_STORE_DIR = testStoreDir;
});

afterEach(() => {
  delete process.env.DOD_STORE_DIR;
  try {
    rmSync(testStoreDir, { recursive: true, force: true });
  } catch {
    /* ok */
  }
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

// ── generateId ────────────────────────────────────────────────────────────

test("generateId returns valid UUID v4", () => {
  assert.match(generateId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("generateId produces 100 unique values", () => {
  const ids = new Set(Array.from({ length: 100 }, () => generateId()));
  assert.equal(ids.size, 100);
});

// ── save + load ───────────────────────────────────────────────────────────

test("save + load round-trip", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded);
    assert.equal(loaded?.id, doc.id);
    assert.equal(loaded?.title, doc.title);
  } finally {
    await remove(doc.id);
  }
});

test("load returns null for nonexistent", async () => {
  assert.equal(await load("nonexistent-id"), null);
});

test("load handles corrupt JSON", async () => {
  const id = "bad-json";
  const fs = await import("node:fs/promises");
  await fs.mkdir(testStoreDir, { recursive: true });
  await fs.writeFile(join(testStoreDir, `${id}.json`), "not json {{{", "utf-8");
  assert.equal(await load(id), null);
});

test("save overwrites same ID", async () => {
  const id = generateId();
  await save(makeDoc(id, { title: "Original" }));
  await save(makeDoc(id, { title: "Updated" }));
  try {
    assert.equal((await load(id))?.title, "Updated");
  } finally {
    await remove(id);
  }
});

test("save handles empty roots", async () => {
  const doc = makeDoc(generateId(), { roots: [] });
  await save(doc);
  try {
    assert.deepEqual((await load(doc.id))?.roots, []);
  } finally {
    await remove(doc.id);
  }
});

test("save handles large amendments", async () => {
  const amendments = Array.from({ length: 100 }, (_, i) => ({
    timestamp: new Date().toISOString(),
    node_path: `0.children.${i}`,
    action: "modified" as const,
    reason: `Amendment #${i}`,
    old_value: { command: `old-${i}`, predicate: { type: "exit_code" as const, value: i } },
    new_value: { command: `new-${i}`, predicate: { type: "exit_code" as const, value: i + 1 } },
  }));
  const doc = makeDoc(generateId(), { amendments });
  await save(doc);
  try {
    assert.equal((await load(doc.id))?.amendments.length, 100);
  } finally {
    await remove(doc.id);
  }
});

// ── loadRaw ────────────────────────────────────────────────────────────────

test("loadRaw returns parsed JSON", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  try {
    const raw = await loadRaw(doc.id);
    assert.ok(raw);
    assert.equal(raw.id, doc.id);
    assert.equal(typeof raw, "object");
  } finally {
    await remove(doc.id);
  }
});

test("loadRaw returns null for nonexistent", async () => {
  assert.equal(await loadRaw("nonexistent"), null);
});

test("loadRaw returns null for corrupt JSON", async () => {
  const fs = await import("node:fs/promises");
  await fs.mkdir(testStoreDir, { recursive: true });
  await fs.writeFile(join(testStoreDir, "corrupt.json"), "{bad", "utf-8");
  assert.equal(await loadRaw("corrupt"), null);
});

// ── findByPath ─────────────────────────────────────────────────────────────

test("findByPath finds by path", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/unique.md" });
  await save(doc);
  try {
    assert.equal((await findByPath("/tmp/unique.md"))?.id, doc.id);
  } finally {
    await remove(doc.id);
  }
});

test("findByPath returns null for none", async () => {
  assert.equal(await findByPath("/nonexistent.md"), null);
});

test("findByPath is case-insensitive", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/Case.md" });
  await save(doc);
  try {
    assert.ok(await findByPath("/tmp/case.md"));
  } finally {
    await remove(doc.id);
  }
});

test("findByPath skips non-JSON files", async () => {
  const fs = await import("node:fs/promises");
  await fs.mkdir(testStoreDir, { recursive: true });
  await fs.writeFile(join(testStoreDir, "readme.txt"), "not json", "utf-8");
  assert.equal(await findByPath("/tmp/any.md"), null);
});

test("findByPath handles corrupt JSON during scan", async () => {
  const doc = makeDoc(generateId(), { markdown_path: "/tmp/good.md" });
  await save(doc);
  const fs = await import("node:fs/promises");
  await fs.writeFile(join(testStoreDir, "corrupt.json"), "{{{not valid", "utf-8");
  try {
    const found = await findByPath("/tmp/good.md");
    assert.equal(found?.id, doc.id);
  } finally {
    await remove(doc.id);
  }
});

// ── listAll ────────────────────────────────────────────────────────────────

test("listAll returns all docs", async () => {
  const id1 = generateId();
  const id2 = generateId();
  await save(makeDoc(id1, { title: "First" }));
  await save(makeDoc(id2, { title: "Second" }));
  try {
    const all = await listAll();
    assert.ok(all.find((d) => d.id === id1));
    assert.ok(all.find((d) => d.id === id2));
    assert.equal(all.length, 2);
  } finally {
    await remove(id1);
    await remove(id2);
  }
});

test("listAll empty store", async () => {
  assert.deepEqual(await listAll(), []);
});

test("listAll skips corrupt JSON", async () => {
  const goodId = generateId();
  await save(makeDoc(goodId, { title: "Good" }));
  const fs = await import("node:fs/promises");
  await fs.writeFile(join(testStoreDir, "corrupt.json"), "{broken", "utf-8");
  try {
    const all = await listAll();
    assert.ok(all.find((d) => d.id === goodId));
  } finally {
    await remove(goodId);
  }
});

// ── listAllRaw ─────────────────────────────────────────────────────────────

test("listAllRaw returns all raw docs", async () => {
  const id = generateId();
  await save(makeDoc(id));
  try {
    const raw = await listAllRaw();
    assert.equal(raw.length, 1);
    assert.equal(raw[0].id, id);
  } finally {
    await remove(id);
  }
});

test("listAllRaw empty store", async () => {
  assert.deepEqual(await listAllRaw(), []);
});

test("listAllRaw skips corrupt JSON", async () => {
  const goodId = generateId();
  await save(makeDoc(goodId));
  const fs = await import("node:fs/promises");
  await fs.writeFile(join(testStoreDir, "corrupt.json"), "{nope", "utf-8");
  try {
    const raw = await listAllRaw();
    assert.ok(raw.some((d: any) => d.id === goodId));
  } finally {
    await remove(goodId);
  }
});

test("listAllRaw skips non-JSON files", async () => {
  const fs = await import("node:fs/promises");
  await fs.mkdir(testStoreDir, { recursive: true });
  await fs.writeFile(join(testStoreDir, "notes.txt"), "hello", "utf-8");
  assert.deepEqual(await listAllRaw(), []);
});

// ── remove ─────────────────────────────────────────────────────────────────

test("remove deletes doc and returns true", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  assert.equal(await remove(doc.id), true);
  assert.equal(await load(doc.id), null);
});

test("remove returns false for nonexistent", async () => {
  assert.equal(await remove("nonexistent"), false);
});

test("remove is idempotent", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  assert.equal(await remove(doc.id), true);
  assert.equal(await remove(doc.id), false);
});

// ── migrateDoc ─────────────────────────────────────────────────────────────

test("migrateDoc returns false when already has roots", async () => {
  const doc = makeDoc(generateId(), {
    roots: [
      { id: "r1", title: "Root", refinement: "concrete" as const, last_status: "pending" as const, children: [] },
    ],
  });
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded);
    assert.equal(await migrateDoc(loaded), false);
  } finally {
    await remove(doc.id);
  }
});

test("migrateDoc returns false when no steps field", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  try {
    assert.equal(await migrateDoc((await load(doc.id)) as any), false);
  } finally {
    await remove(doc.id);
  }
});

test("migrateDoc converts legacy steps to roots", async () => {
  const legacySteps = [
    {
      id: "step-1",
      title: "Code Quality",
      proofs: [
        {
          id: "proof-1",
          title: "Lint",
          command: "npm run lint",
          predicate: { type: "exit_code", value: 0 },
          description: "Lint check",
          category: "lint",
          advisory: false,
        },
        {
          id: "proof-2",
          title: "Test",
          command: "npm test",
          predicate: { type: "exit_code", value: 0 },
          description: "Tests pass",
          category: "test",
          advisory: false,
        },
      ],
    },
  ];
  const partial = makeDoc(generateId());
  const doc = { ...partial, roots: undefined } as unknown as DodDocument & { steps: any[] };
  doc.steps = legacySteps;
  await save(doc);
  try {
    const loaded = await load(doc.id);
    assert.ok(loaded);
    assert.equal(await migrateDoc(loaded), true);
    const reloaded = await load(doc.id);
    assert.ok(reloaded?.roots, "should have roots after migration");
    assert.equal(reloaded?.roots?.length, 1);
    assert.equal(reloaded?.proof_fingerprint?.length, 64);
    assert.equal((reloaded as any).steps, undefined, "steps should be deleted");
    assert.equal((reloaded as any).locked, undefined, "locked should be deleted");
  } finally {
    await remove(doc.id);
  }
});

// ── listLegacyCount ────────────────────────────────────────────────────────

test("listLegacyCount returns 0 for empty store", async () => {
  assert.equal(await listLegacyCount(), 0);
});

test("listLegacyCount counts legacy docs with steps but no roots", async () => {
  const base = makeDoc(generateId());
  const legacyDoc = { ...base, steps: [{ id: "s1", title: "Step", proofs: [] }] } as any;
  delete legacyDoc.roots;
  await save(legacyDoc);
  try {
    assert.equal(await listLegacyCount(), 1);
  } finally {
    await remove(legacyDoc.id);
  }
});

test("listLegacyCount does not count migrated docs", async () => {
  const doc = makeDoc(generateId());
  await save(doc);
  try {
    assert.equal(await listLegacyCount(), 0);
  } finally {
    await remove(doc.id);
  }
});
