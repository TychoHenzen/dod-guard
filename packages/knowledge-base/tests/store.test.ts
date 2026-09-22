import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBase } from "../src/store.js";
import { cleanCodeSectionKeys, copyShippedKnowledgeRoot, removeRoot, shippedKnowledgeRoot } from "./test-support.js";

test("indexes, searches, and reads entries", async () => {
  const root = shippedKnowledgeRoot;
  const base = new KnowledgeBase(root, () => "2026-09-16T00:00:00.000Z");
  assert.deepEqual(
    (await base.chapters()).map((item) => item.key),
    ["clean-code", "design-patterns", "refactoring", "ux-ui-design"],
  );
  assert.deepEqual(
    (await base.sections("clean-code")).map((item) => item.key),
    cleanCodeSectionKeys,
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
  assert.match((await base.get("clean-code.clean-code")).sources[0]?.label ?? "", /PDF pages 33-47/);
  assert.match((await base.get("clean-code.meaningful-names")).sources[0].label, /PDF pages 48-61/);
  assert.match((await base.get("clean-code.functions")).sources[0].label, /PDF pages 62-83/);
  assert.match((await base.get("clean-code.comments")).sources[0].label, /PDF pages 84-105/);
  assert.match((await base.get("clean-code.boundaries")).sources[0].label, /PDF pages 144-151/);
  assert.match((await base.get("clean-code.formatting")).sources[0].label, /PDF pages 106-123/);
  assert.match((await base.get("clean-code.objects-data-structures")).sources[0].label, /PDF pages 124-132/);
  assert.match((await base.get("clean-code.error-handling")).sources[0].label, /PDF pages 134-143/);
  assert.match((await base.get("clean-code.classes")).sources[0].label, /PDF pages 166-182/);
  assert.match((await base.get("clean-code.unit-tests")).sources[0].label, /PDF pages 152-164/);
  assert.match((await base.get("clean-code.systems")).sources[0].label, /PDF pages 184-201/);
  assert.match((await base.get("clean-code.emergence")).sources[0].label, /PDF pages 203-208/);
  assert.match((await base.get("clean-code.concurrency")).sources[0].label, /PDF pages 209-222/);
  assert.match((await base.get("clean-code.junit-internals")).sources[0].label, /PDF pages 283-298/);
  assert.match((await base.get("clean-code.refactoring-serialdate")).sources[0].label, /PDF pages 299-316/);
  assert.match((await base.get("clean-code.successive-refinement")).sources[0].label, /PDF pages 225-282/);
  assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
});

test("rejects malformed documents without writing an index", async () => {
  const root = await copyShippedKnowledgeRoot();
  try {
    const base = new KnowledgeBase(root);
    await writeFile(join(root, "entries", "broken.md"), "---\nkey: broken\n---\nnot enough metadata\n", "utf8");

    await assert.rejects(() => base.chapters(), /Invalid knowledge document/);
    assert.equal(existsSync(join(root, ".knowledge-index.json")), false);
  } finally {
    await removeRoot(root);
  }
});
