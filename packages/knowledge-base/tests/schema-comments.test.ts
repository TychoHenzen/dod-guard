import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { exampleText } from "./test-support.js";

test("preserves Chapter 4 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(await exampleText("clean-code.comments.md"), "entries/clean-code.comments.md");

  assert.equal(entry.key, "clean-code.comments");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.comments");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 53-74/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 84-105/);
  assert.match(entry.content, /expressive code/);
});
