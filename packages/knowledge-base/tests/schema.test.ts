import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KnowledgeBaseError,
  parseKnowledgeDocument,
  serializeKnowledgeDocument,
  validateUniqueEntries,
} from "../src/schema.js";
import { exampleText } from "./test-support.js";

test("parses and serializes a portable Markdown entry schema", async () => {
  const entry = parseKnowledgeDocument(
    await exampleText("refactoring.move-method.md"),
    "entries/refactoring.move-method.md",
  );

  assert.equal(entry.key, "refactoring.move-method");
  assert.equal(entry.chapter, "refactoring");
  assert.equal(entry.section, "refactoring.method-movement");
  assert.equal(entry.sources[0]?.project, "dod-guard");
  assert.equal(entry.sources[0]?.language, "TypeScript");
  assert.deepEqual(entry.history, []);

  const roundTrip = parseKnowledgeDocument(serializeKnowledgeDocument(entry), entry.path ?? "entry.md");
  assert.deepEqual(roundTrip, entry);
});

test("preserves Chapter 1 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await exampleText("clean-code.clean-code.md"),
    "entries/clean-code.clean-code.md",
  );

  assert.equal(entry.key, "clean-code.clean-code");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.foundation");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 1-16/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 33-47/);
  assert.match(entry.content, /executable detail of a requirement/);
});

test("preserves Chapter 2 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await exampleText("clean-code.meaningful-names.md"),
    "entries/clean-code.meaningful-names.md",
  );

  assert.equal(entry.key, "clean-code.meaningful-names");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.meaningful-names");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 17-30/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 48-61/);
  assert.match(entry.content, /expose intent/);
});

test("preserves Chapter 3 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(await exampleText("clean-code.functions.md"), "entries/clean-code.functions.md");

  assert.equal(entry.key, "clean-code.functions");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.functions");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 31-52/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 62-83/);
  assert.match(entry.content, /one level of abstraction/);
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

  const entry = parseKnowledgeDocument(await exampleText("design-patterns.strategy.md"), "entries/strategy.md");
  assert.throws(
    () => validateUniqueEntries([entry, { ...entry, path: "entries/copy.md" }]),
    (error: unknown) => error instanceof KnowledgeBaseError && /duplicate hierarchy key/.test(error.message),
  );
});

test("rejects a broken related key before it can be indexed", async () => {
  const entry = parseKnowledgeDocument(await exampleText("ux-ui-design.accessible-dialogs.md"), "entries/dialog.md");
  assert.throws(
    () => validateUniqueEntries([{ ...entry, relatedKeys: ["missing.entry"] }]),
    (error: unknown) =>
      error instanceof KnowledgeBaseError && /related key missing.entry does not exist/.test(error.message),
  );
});
