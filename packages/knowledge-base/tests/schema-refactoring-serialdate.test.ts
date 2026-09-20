import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { exampleText } from "./test-support.js";

test("preserves Chapter 16 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await exampleText("clean-code.refactoring-serialdate.md"),
    "entries/clean-code.refactoring-serialdate.md",
  );

  assert.equal(entry.key, "clean-code.refactoring-serialdate");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.refactoring-serialdate");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 268-285/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 299-316/);
  assert.match(entry.content, /tests green|green/);
  assert.match(entry.content, /flag arguments|named types/);
  assert.match(entry.content, /Boy Scout Rule/);
});
