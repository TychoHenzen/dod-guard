import assert from "node:assert/strict";
import { test } from "node:test";
import { KnowledgeBaseError, parseKnowledgeDocument, validateUniqueEntries } from "../src/schema.js";
import { syntheticSchemaEntry } from "./synthetic-fixtures.js";

test("parses a generic synthetic Markdown entry", () => {
  const entry = parseKnowledgeDocument(syntheticSchemaEntry, "entries/schema/sample.md");

  assert.equal(entry.key, "schema.sample");
  assert.equal(entry.chapter, "schema");
  assert.equal(entry.section, "schema.validation");
  assert.equal(entry.sources[0]?.project, "fixture-project");
  assert.equal(entry.sources[0]?.language, "TypeScript");
});

test("rejects malformed and duplicate hierarchy keys in synthetic documents", () => {
  const malformed = [
    "---",
    "key: invalid key",
    "title: Synthetic malformed entry",
    "chapter: bad",
    "section: bad.section",
    "summary: Synthetic malformed summary",
    "sources:",
    "  - label: synthetic fixture",
    "---",
    "Synthetic malformed content.",
  ].join("\n");
  assert.throws(
    () => parseKnowledgeDocument(malformed, "entries/schema/malformed.md"),
    (error: unknown) => error instanceof KnowledgeBaseError && /stable hierarchy key/.test(error.message),
  );

  const original = parseKnowledgeDocument(syntheticSchemaEntry, "entries/schema/sample.md");
  const duplicate = parseKnowledgeDocument(syntheticSchemaEntry, "entries/schema/duplicate.md");
  assert.throws(
    () => validateUniqueEntries([original, duplicate]),
    (error: unknown) => error instanceof KnowledgeBaseError && /duplicate hierarchy key/.test(error.message),
  );
});

test("rejects a broken related key in a synthetic document", () => {
  const entryText = syntheticSchemaEntry.replace("related_keys: []", "related_keys:\n  - missing.entry");
  const entry = parseKnowledgeDocument(entryText, "entries/schema/sample.md");
  assert.throws(
    () => validateUniqueEntries([entry]),
    (error: unknown) =>
      error instanceof KnowledgeBaseError && /related key missing.entry does not exist/.test(error.message),
  );
});
