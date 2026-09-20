import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { exampleText } from "./test-support.js";

test("preserves Chapter 5 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await exampleText("clean-code.formatting.md"),
    "entries/clean-code.formatting.md",
  );

  assert.equal(entry.key, "clean-code.formatting");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.formatting");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 75-92/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 106-123/);
  assert.match(entry.content, /communication/);
});
