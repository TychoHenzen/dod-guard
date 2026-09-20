import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { exampleText } from "./test-support.js";

test("preserves Chapter 10 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(await exampleText("clean-code.classes.md"), "entries/clean-code.classes.md");

  assert.equal(entry.key, "clean-code.classes");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.classes");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 135-151/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 166-182/);
  assert.match(entry.content, /cohesive/);
});
