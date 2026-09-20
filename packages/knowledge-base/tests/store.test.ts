import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBase, type SaveKnowledgeEntryInput } from "../src/store.js";
import { cleanCodeSectionKeys, exampleRoot, removeRoot } from "./test-support.js";

test("persists, indexes, searches, and reloads entries", async () => {
  const root = await exampleRoot();
  try {
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
    assert.match((await base.get("clean-code.successive-refinement")).sources[0].label, /PDF pages 225-282/);
    assert.equal(existsSync(join(root, ".knowledge-index.json")), true);

    const newEntry: SaveKnowledgeEntryInput = {
      key: "refactoring.extract-method",
      title: "Extract Method",
      chapter: "refactoring",
      section: "refactoring.method-movement",
      summary: "Give one named operation a focused responsibility.",
      content: "Extract a coherent block when the new name makes the caller easier to read.",
      sources: [{ label: "test source", project: "dod-guard", language: "TypeScript" }],
      relatedKeys: ["refactoring.move-method"],
    };
    const saved = await base.save(newEntry);
    assert.equal(saved.history.length, 0);
    assert.equal((await new KnowledgeBase(root).entries("refactoring", "refactoring.method-movement")).length, 2);

    const refined = await new KnowledgeBase(root).save({
      key: newEntry.key,
      summary: "Give a coherent block one focused responsibility.",
      content: "Refine the block after checking all callers and tests.",
      reason: "clarified caller safety",
    });
    assert.equal(refined.history.length, 1);
    assert.equal(refined.history[0]?.content, newEntry.content);
    assert.equal(refined.sources[0]?.project, "dod-guard");
    assert.equal((await new KnowledgeBase(root).get(newEntry.key)).history[0]?.reason, "clarified caller safety");
    assert.deepEqual(
      (await new KnowledgeBase(root).related(newEntry.key)).map((item) => item.key),
      ["refactoring.move-method"],
    );
  } finally {
    await removeRoot(root);
  }
});

test("keeps the previous derived index when a document is malformed", async () => {
  const root = await exampleRoot();
  try {
    const base = new KnowledgeBase(root);
    await base.chapters();
    const indexPath = join(root, ".knowledge-index.json");
    const previousIndex = readFileSync(indexPath, "utf8");
    await writeFile(join(root, "entries", "broken.md"), "---\nkey: broken\n---\nnot enough metadata\n", "utf8");

    await assert.rejects(() => base.chapters(), /Invalid knowledge document/);
    assert.equal(readFileSync(indexPath, "utf8"), previousIndex);
  } finally {
    await removeRoot(root);
  }
});

test("replaces a manually renamed entry without leaving a duplicate key", async () => {
  const root = await exampleRoot();
  try {
    const oldPath = join(root, "entries", "refactoring.move-method.md");
    const renamedPath = join(root, "entries", "legacy-name.md");
    await rename(oldPath, renamedPath);

    const base = new KnowledgeBase(root);
    const updated = await base.save({
      key: "refactoring.move-method",
      content: "The entry was refined after its source file was renamed.",
      reason: "preserve stable key after rename",
    });

    assert.equal(updated.history.length, 1);
    assert.equal(existsSync(renamedPath), false);
    assert.equal(existsSync(oldPath), true);
    assert.match((await base.get("refactoring.move-method")).content, /source file was renamed/);
  } finally {
    await removeRoot(root);
  }
});

test("rejects missing related entries and stays isolated from a separate memory directory", async () => {
  const root = await exampleRoot();
  try {
    const memoryDir = join(root, "built-in-memory");
    await mkdir(memoryDir, { recursive: true });
    const sentinel = join(memoryDir, "secret.md");
    await writeFile(sentinel, "do not read this", "utf8");
    const base = new KnowledgeBase(join(root, "knowledge"));

    await assert.rejects(
      () =>
        base.save({
          key: "new.entry",
          title: "New",
          chapter: "new",
          section: "new.section",
          summary: "New entry.",
          content: "Content.",
          sources: [{ label: "test" }],
          relatedKeys: ["missing.entry"],
        }),
      /related key missing.entry does not exist/,
    );
    assert.equal(existsSync(join(root, "knowledge", "entries", "new.entry.md")), false);
    assert.equal(readFileSync(sentinel, "utf8"), "do not read this");
    assert.deepEqual(await base.search("do not read"), []);
  } finally {
    await removeRoot(root);
  }
});
