import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkMarkdown, hashContent } from "./indexer.js";

describe("chunkMarkdown", () => {
  it("splits markdown by headings when content is long enough", () => {
    // Build a note with enough content to force multiple chunks (>800 chars)
    const pad =
      "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ".repeat(
        5,
      );
    const md = ["# Title", pad, "", "## Section 1", pad, "", "## Section 2", pad].join("\n");

    const chunks = chunkMarkdown("test.md", md);
    assert.ok(chunks.length >= 2, `expected >=2 chunks, got ${chunks.length}`);
    assert.equal(chunks[0].notePath, "test.md");
  });

  it("short note produces single chunk", () => {
    const chunks = chunkMarkdown("short.md", "Just a short note.");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].notePath, "short.md");
  });

  it("empty markdown produces single empty-ish chunk", () => {
    const chunks = chunkMarkdown("empty.md", "");
    assert.equal(chunks.length, 1);
  });

  it("preserves code blocks intact", () => {
    const md = ["# Code", "```ts", "const x = 1;", "// this is not a heading", "```", "After code."].join("\n");

    const chunks = chunkMarkdown("code.md", md);
    const fullText = chunks.map((c) => c.content).join(" ");
    assert.ok(fullText.includes("const x = 1"), "code should be preserved");
    assert.ok(fullText.includes("After code"), "text after code should be present");
  });
});

describe("hashContent", () => {
  it("produces stable hash", () => {
    const h1 = hashContent("hello world");
    const h2 = hashContent("hello world");
    assert.equal(h1, h2);
  });

  it("different content produces different hash", () => {
    const h1 = hashContent("hello");
    const h2 = hashContent("world");
    assert.notEqual(h1, h2);
  });
});
