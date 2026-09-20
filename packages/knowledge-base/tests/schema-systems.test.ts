import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { exampleText } from "./test-support.js";

test("preserves Chapter 11 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(await exampleText("clean-code.systems.md"), "entries/clean-code.systems.md");

  assert.equal(entry.key, "clean-code.systems");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.systems");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 153-170/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 184-201/);
  assert.match(entry.content, /construction from use|construction.*use/);
  assert.match(entry.content, /test-drive the system architecture/i);
});
