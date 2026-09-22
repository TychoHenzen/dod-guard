import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 8 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.boundaries.md"),
    "entries/clean-code.boundaries.md",
  );

  assert.equal(entry.key, "clean-code.boundaries");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.boundaries");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 113-120/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 144-151/);
  assert.match(entry.content, /third-party/);
});
