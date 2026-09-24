import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { KnowledgeBaseError, parseKnowledgeDocument, validateUniqueEntries } from "../src/schema.js";
import { createKnowledgeRoot, removeRoot } from "./test-support.js";

test("parses a synthetic Markdown entry", async () => {
  const root = await createKnowledgeRoot();
  try {
    const entry = parseKnowledgeDocument(
      await readFile(join(root, "entries", "guide.alpha.md"), "utf8"),
      "entries/guide.alpha.md",
    );

    assert.equal(entry.key, "guide.alpha");
    assert.equal(entry.chapter, "guide");
    assert.equal(entry.section, "guide.basics");
    assert.equal(entry.sources[0]?.project, "fixture-project");
    assert.equal(entry.sources[0]?.language, "TypeScript");
    assert.equal(entry.content, "Alpha fixture content.");
  } finally {
    await removeRoot(root);
  }
});

test("rejects malformed and duplicate hierarchy keys", async () => {
  assert.throws(
    () =>
      parseKnowledgeDocument(
        "---\nkey: invalid key\ntitle: Bad\nchapter: bad\nsection: bad.section\nsummary: Bad\nsources:\n  - label: test\n---\ncontent",
        "entries/bad.md",
      ),
    (error: unknown) => error instanceof KnowledgeBaseError && /stable hierarchy key/.test(error.message),
  );

  const root = await createKnowledgeRoot();
  try {
    const entry = parseKnowledgeDocument(
      await readFile(join(root, "entries", "guide.beta.md"), "utf8"),
      "entries/guide.beta.md",
    );
    assert.throws(
      () => validateUniqueEntries([entry, { ...entry, path: "entries/copy.md" }]),
      (error: unknown) => error instanceof KnowledgeBaseError && /duplicate hierarchy key/.test(error.message),
    );
  } finally {
    await removeRoot(root);
  }
});

test("rejects a broken related key before it can be indexed", async () => {
  const root = await createKnowledgeRoot();
  try {
    const entry = parseKnowledgeDocument(
      await readFile(join(root, "entries", "guide.beta.md"), "utf8"),
      "entries/guide.beta.md",
    );
    assert.throws(
      () => validateUniqueEntries([{ ...entry, relatedKeys: ["missing.entry"] }]),
      (error: unknown) =>
        error instanceof KnowledgeBaseError && /related key missing.entry does not exist/.test(error.message),
    );
  } finally {
    await removeRoot(root);
  }
});
