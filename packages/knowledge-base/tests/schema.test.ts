import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBaseError, parseKnowledgeDocument, validateUniqueEntries } from "../src/schema.js";
import { copyShippedKnowledgeRoot, removeRoot, shippedEntryText } from "./test-support.js";

test("parses a shipped Markdown entry", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("refactoring.move-method.md"),
    "entries/refactoring.move-method.md",
  );

  assert.equal(entry.key, "refactoring.move-method");
  assert.equal(entry.chapter, "refactoring");
  assert.equal(entry.section, "refactoring.method-movement");
  assert.equal(entry.sources[0]?.project, "dod-guard");
  assert.equal(entry.sources[0]?.language, "TypeScript");
});

test("preserves shipped Clean Code provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.clean-code.md"),
    "entries/clean-code.clean-code.md",
  );

  assert.equal(entry.key, "clean-code.clean-code");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.foundation");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 1-16/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 33-47/);
  assert.match(entry.content, /executable detail of a requirement/);
});

test("preserves shipped Chapter 2 and Chapter 3 provenance", async () => {
  const names = ["clean-code.meaningful-names.md", "clean-code.functions.md"];
  const entries = await Promise.all(
    names.map(async (name) => parseKnowledgeDocument(await shippedEntryText(name), `entries/${name}`)),
  );

  assert.equal(entries[0]?.key, "clean-code.meaningful-names");
  assert.equal(entries[0]?.section, "clean-code.meaningful-names");
  assert.match(entries[0]?.sources[0]?.label ?? "", /PDF pages 48-61/);
  assert.match(entries[0]?.content ?? "", /expose intent/);
  assert.equal(entries[1]?.key, "clean-code.functions");
  assert.equal(entries[1]?.section, "clean-code.functions");
  assert.match(entries[1]?.sources[0]?.label ?? "", /PDF pages 62-83/);
  assert.match(entries[1]?.content ?? "", /one level of abstraction/);
});

test("rejects malformed and duplicate hierarchy keys in a temporary corpus", async () => {
  const root = await copyShippedKnowledgeRoot();
  try {
    const malformedPath = join(root, "entries", "bad.md");
    await writeFile(
      malformedPath,
      "---\nkey: invalid key\ntitle: Bad\nchapter: bad\nsection: bad.section\nsummary: Bad\nsources:\n  - label: test\n---\ncontent",
      "utf8",
    );
    const malformed = await readFile(malformedPath, "utf8");
    assert.throws(
      () => parseKnowledgeDocument(malformed, "entries/bad.md"),
      (error: unknown) => error instanceof KnowledgeBaseError && /stable hierarchy key/.test(error.message),
    );

    const originalPath = join(root, "entries", "design-patterns.strategy.md");
    const duplicatePath = join(root, "entries", "copy.md");
    const original = await readFile(originalPath, "utf8");
    await writeFile(duplicatePath, original, "utf8");
    const entry = parseKnowledgeDocument(original, "entries/design-patterns.strategy.md");
    const duplicate = parseKnowledgeDocument(await readFile(duplicatePath, "utf8"), "entries/copy.md");
    assert.throws(
      () => validateUniqueEntries([entry, duplicate]),
      (error: unknown) => error instanceof KnowledgeBaseError && /duplicate hierarchy key/.test(error.message),
    );
  } finally {
    await removeRoot(root);
  }
});

test("rejects a broken related key in a temporary corpus", async () => {
  const root = await copyShippedKnowledgeRoot();
  try {
    const entryPath = join(root, "entries", "ux-ui-design.accessible-dialogs.md");
    const entryText = (await readFile(entryPath, "utf8")).replace("related_keys: []", "related_keys:\n  - missing.entry");
    await writeFile(entryPath, entryText, "utf8");
    const entry = parseKnowledgeDocument(
      await readFile(entryPath, "utf8"),
      "entries/ux-ui-design.accessible-dialogs.md",
    );
    assert.throws(
      () => validateUniqueEntries([entry]),
      (error: unknown) =>
        error instanceof KnowledgeBaseError && /related key missing.entry does not exist/.test(error.message),
    );
  } finally {
    await removeRoot(root);
  }
});
