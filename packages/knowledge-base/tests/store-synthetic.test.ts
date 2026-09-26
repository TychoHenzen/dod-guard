import assert from "node:assert/strict";
import { test } from "node:test";
import { KnowledgeBase } from "../src/store.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";
import { createSyntheticKnowledgeRoot, removeRoot } from "./test-support.js";

async function assertSyntheticCorpus(base: KnowledgeBase): Promise<void> {
  assert.deepEqual(await base.chapters(), [
    { key: "alpha", entryCount: 2 },
    { key: "beta", entryCount: 1 },
  ]);
  assert.deepEqual(await base.sections("alpha"), [{ key: "alpha.topic", chapter: "alpha", entryCount: 2 }]);
  assert.deepEqual(
    (await base.entries("alpha", "alpha.topic")).map((entry) => entry.key),
    ["alpha.first", "alpha.second"],
  );
  assert.deepEqual(
    (await base.search("shared", 10)).map((entry) => entry.key),
    ["alpha.first", "alpha.second"],
  );
  assert.equal((await base.search("alpha.first"))[0]?.score, 1);
  assert.deepEqual(await base.search("   "), []);
  assert.equal((await base.get("alpha.first")).content, "Shared synthetic content for the first entry.");
  assert.deepEqual(
    (await base.related("alpha.first")).map((entry) => entry.key),
    ["alpha.second"],
  );
}

test("browses and searches a recursive synthetic corpus deterministically", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const base = new KnowledgeBase(root, () => "2026-09-16T00:00:00.000Z");
    await assertSyntheticCorpus(base);
    await assert.rejects(() => base.sections("not a key"), /chapter is not a stable hierarchy key/);
    await assert.rejects(() => base.entries("alpha", "not a key"), /section is not a stable hierarchy key/);
    await assert.rejects(() => base.get("missing.entry"), /knowledge entry not found/);
  } finally {
    await removeRoot(root);
  }
});
