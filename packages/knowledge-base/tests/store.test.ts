import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBase } from "../src/store.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";
import { createSyntheticKnowledgeRoot, removeRoot } from "./test-support.js";

test("indexes, searches, and reads a recursive synthetic corpus", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const base = new KnowledgeBase(root, () => "2026-09-16T00:00:00.000Z");
    assert.deepEqual(
      (await base.chapters()).map((item) => item.key),
      ["alpha", "beta"],
    );
    assert.deepEqual(
      (await base.sections("alpha")).map((item) => item.key),
      ["alpha.topic"],
    );
    const entries = await base.entries("alpha", "alpha.topic");
    assert.deepEqual(entries.map((entry) => entry.key), ["alpha.first", "alpha.second"]);
    assert.equal("content" in (entries[0] ?? {}), false);
    assert.equal((await base.search("fixture-project", 5))[0]?.key, "alpha.first");
    assert.equal((await base.get("alpha.first")).language, "TypeScript");
    assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
  } finally {
    await removeRoot(root);
  }
});

test("rejects a missing entries directory and propagates other read errors", async () => {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-missing-entries-"));
  try {
    const missingEntries = new KnowledgeBase(root);
    await assert.rejects(() => missingEntries.chapters(), /DOD_GUARD_KNOWLEDGE_BASE_DIR.*entries/);

    await assert.rejects(() => new KnowledgeBase(`${root}\0`).chapters(), /null bytes|invalid/i);
  } finally {
    await removeRoot(root);
  }
});

test("rejects malformed documents without writing an index", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const base = new KnowledgeBase(root);
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");

    await assert.rejects(() => base.chapters(), /Invalid knowledge document/);
    assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
  } finally {
    await removeRoot(root);
  }
});
