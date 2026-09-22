import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKnowledgeDocument } from "../src/schema.js";
import { shippedEntryText } from "./test-support.js";

test("preserves Chapter 12 source provenance and hierarchy", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("clean-code.emergence.md"),
    "entries/clean-code.emergence.md",
  );

  assert.equal(entry.key, "clean-code.emergence");
  assert.equal(entry.chapter, "clean-code");
  assert.equal(entry.section, "clean-code.emergence");
  assert.equal(entry.project, "clean-code");
  assert.equal(entry.language, "English");
  assert.equal(entry.sources[0]?.project, "clean-code");
  assert.equal(entry.sources[0]?.language, "English");
  assert.match(entry.sources[0]?.label ?? "", /printed pages 172-177/);
  assert.match(entry.sources[0]?.label ?? "", /PDF pages 203-208/);
  const content = entry.content.toLowerCase();
  const priorities = ["all of its tests", "duplication", "express its intent", "class and method counts"];
  assert.ok(
    priorities.every(
      (priority, index) => index === 0 || content.indexOf(priority) > content.indexOf(priorities[index - 1]),
    ),
  );
  assert.match(content, /testable boundary|testable/);
  assert.match(content, /incrementally refactor|refactor the design/);
  assert.match(content, /reuse in the small|smallest useful boundary/);
  assert.match(content, /good names|expressive.*tests/);
  assert.match(content, /dogma|dogmatic/);
});
