import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 14 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.successive-refinement.md"),
    "entries/clean-code.successive-refinement.md",
  );

  assert.equal(entry.key, "clean-code.successive-refinement");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.successive-refinement");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 194-251/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 225-282/);
  assert.match(entry.content, /tests|test suite/);
  assert.match(entry.content, /small steps|small extractions/);
  assert.match(entry.content, /deleting|deletion/i);
});
