import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBase } from "../src/store.js";
import { createKnowledgeRoot, removeRoot } from "./test-support.js";

test("indexes, searches, and reads synthetic entries", async () => {
  const root = await createKnowledgeRoot();
  try {
    const base = new KnowledgeBase(root, () => "2026-09-16T00:00:00.000Z");
    assert.deepEqual(
      (await base.chapters()).map((item) => item.key),
      ["guide", "patterns"],
    );
    assert.deepEqual(
      (await base.sections("guide")).map((item) => item.key),
      ["guide.basics"],
    );
    assert.equal((await base.entries("guide", "guide.basics")).length, 2);
    assert.equal((await base.entries("guide", "guide.basics"))[0]?.path, "entries/guide.alpha.md");
    assert.equal("content" in ((await base.entries("guide", "guide.basics"))[0] ?? {}), false);
    assert.equal((await base.search("choice pattern", 5))[0]?.key, "patterns.choice");
    assert.equal((await base.get("patterns.choice")).language, "Rust");
    assert.equal((await base.get("guide.alpha")).content, "Alpha fixture content.");
    assert.deepEqual(
      (await base.related("guide.alpha")).map((entry) => entry.key),
      ["guide.beta"],
    );
    assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
  } finally {
    await removeRoot(root);
  }
});

test("rejects malformed documents without writing an index", async () => {
  const root = await createKnowledgeRoot();
  try {
    const base = new KnowledgeBase(root);
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");

    await assert.rejects(() => base.chapters(), /Invalid knowledge document/);
    assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
  } finally {
    await removeRoot(root);
  }
});
