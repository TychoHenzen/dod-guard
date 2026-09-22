import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 15 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.junit-internals.md"),
    "entries/clean-code.junit-internals.md",
  );

  assert.equal(entry.key, "clean-code.junit-internals");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.junit-internals");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 252-267/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 283-298/);
  assert.match(entry.content, /tests as documentation|test suite/);
  assert.match(entry.content, /small, test-backed steps/);
  assert.match(entry.content, /Delete dead conditionals|dead conditionals/);
});
