import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 7 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.error-handling.md"),
    "entries/clean-code.error-handling.md",
  );

  assert.equal(entry.key, "clean-code.error-handling");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.error-handling");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 103-112/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 134-143/);
  assert.match(entry.content, /exceptions/);
});
