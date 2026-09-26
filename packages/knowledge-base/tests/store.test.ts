import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBase } from "../src/store.js";
import {
  copyShippedKnowledgeRoot,
  createSyntheticKnowledgeRoot,
  removeRoot,
  shippedKnowledgeRoot,
} from "./test-support.js";

const syntheticEntries = {
  "alpha/first.md": [
    "---",
    "key: alpha.first",
    "title: First synthetic entry",
    "chapter: alpha",
    "section: alpha.topic",
    "summary: Shared synthetic summary",
    "sources:",
    "  - label: synthetic fixture",
    "    project: fixture-project",
    "    language: TypeScript",
    "related_keys:",
    "  - alpha.second",
    "project: fixture-project",
    "language: TypeScript",
    "---",
    "Shared synthetic content for the first entry.",
  ].join("\n"),
  "alpha/second.md": [
    "---",
    "key: alpha.second",
    "title: Second synthetic entry",
    "chapter: alpha",
    "section: alpha.topic",
    "summary: Shared synthetic summary",
    "sources:",
    "  - label: synthetic fixture",
    "---",
    "Shared synthetic content for the second entry.",
  ].join("\n"),
  "beta/third.md": [
    "---",
    "key: beta.third",
    "title: Third synthetic entry",
    "chapter: beta",
    "section: beta.topic",
    "summary: Separate synthetic summary",
    "sources:",
    "  - label: synthetic fixture",
    "---",
    "Separate synthetic content.",
  ].join("\n"),
};

test("indexes, searches, and reads the shipped corpus", async () => {
  const base = new KnowledgeBase(shippedKnowledgeRoot, () => "2026-09-16T00:00:00.000Z");
  assert.deepEqual(
    (await base.chapters()).map((item) => item.key),
    ["design-patterns", "refactoring", "ux-ui-design"],
  );
  assert.deepEqual(
    (await base.sections("refactoring")).map((item) => item.key),
    ["refactoring.method-movement"],
  );
  const entries = await base.entries("refactoring", "refactoring.method-movement");
  assert.equal(entries[0]?.key, "refactoring.move-method");
  assert.equal("content" in (entries[0] ?? {}), false);
  assert.equal((await base.search("Move Method refactoring", 5))[0]?.key, "refactoring.move-method");
  assert.deepEqual(
    (await base.search("C#", 5)).map((item) => item.key),
    ["design-patterns.strategy"],
  );
  assert.equal((await base.get("design-patterns.strategy")).language, "C#");
  assert.equal(existsSync(join(shippedKnowledgeRoot, ".knowledge-index.json")), false);
});

test("browses and searches a recursive synthetic corpus deterministically", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticEntries);
  try {
    const base = new KnowledgeBase(root, () => "2026-09-16T00:00:00.000Z");
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
    await assert.rejects(() => base.sections("not a key"), /chapter is not a stable hierarchy key/);
    await assert.rejects(() => base.entries("alpha", "not a key"), /section is not a stable hierarchy key/);
    await assert.rejects(() => base.get("missing.entry"), /knowledge entry not found/);
  } finally {
    await removeRoot(root);
  }
});

test("treats a missing entries directory as an empty corpus and propagates other read errors", async () => {
  const root = await createSyntheticKnowledgeRoot({});
  try {
    const empty = new KnowledgeBase(root);
    assert.deepEqual(await empty.chapters(), []);
    assert.deepEqual(await empty.search("anything"), []);

    await assert.rejects(() => new KnowledgeBase(`${root}\0`).chapters(), /null bytes|invalid/i);
  } finally {
    await removeRoot(root);
  }
});

test("rejects malformed documents without writing an index", async () => {
  const root = await copyShippedKnowledgeRoot();
  try {
    const base = new KnowledgeBase(root);
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");

    await assert.rejects(() => base.chapters(), /Invalid knowledge document/);
    assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
  } finally {
    await removeRoot(root);
  }
});
