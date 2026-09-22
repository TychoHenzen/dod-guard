import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 6 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.objects-data-structures.md"),
    "entries/clean-code.objects-data-structures.md",
  );

  assert.equal(entry.key, "clean-code.objects-data-structures");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.objects-data-structures");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 93-101/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 124-132/);
  assert.match(entry.content, /abstractions/);
});
