import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 13 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.concurrency.md"),
    "entries/clean-code.concurrency.md",
  );

  assert.equal(entry.key, "clean-code.concurrency");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.concurrency");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 178-191/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 209-222/);
  assert.match(entry.content, /decouples what gets done from when/);
  assert.match(entry.content, /shared data/);
  assert.match(entry.content, /shutdown/);
  assert.match(entry.content, /pluggable and tunable/);
});
