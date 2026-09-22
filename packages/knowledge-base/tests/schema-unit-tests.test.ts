import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 9 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.unit-tests.md"),
    "entries/clean-code.unit-tests.md",
  );

  assert.equal(entry.key, "clean-code.unit-tests");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.unit-tests");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 121-133/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 152-164/);
  assert.match(entry.content, /F\.I\.R\.S\.T\./);
});
