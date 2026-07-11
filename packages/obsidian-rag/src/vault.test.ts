import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractWikilinks, memoryDir } from "./vault.js";

describe("extractWikilinks", () => {
  it("returns empty array for content without wikilinks", () => {
    assert.deepStrictEqual(extractWikilinks("plain text"), []);
  });

  it("extracts simple wikilink", () => {
    assert.deepStrictEqual(extractWikilinks("see [[My Note]] for details"), ["My Note"]);
  });

  it("extracts multiple unique wikilinks", () => {
    const content = "see [[Note A]] and [[Note B]] and also [[Note A]]";
    assert.deepStrictEqual(extractWikilinks(content), ["Note A", "Note B"]);
  });

  it("strips heading anchors", () => {
    assert.deepStrictEqual(extractWikilinks("see [[Note#section]]"), ["Note"]);
  });

  it("strips aliases", () => {
    assert.deepStrictEqual(extractWikilinks("see [[Note|display text]]"), ["Note"]);
  });

  it("handles heading anchor with alias", () => {
    assert.deepStrictEqual(extractWikilinks("see [[Note#section|display]]"), ["Note"]);
  });

  it("handles multiple wikilinks on same line", () => {
    const content = "compare [[A]] vs [[B]] and [[C]]";
    assert.deepStrictEqual(extractWikilinks(content), ["A", "B", "C"]);
  });

  it("trims whitespace from link target", () => {
    assert.deepStrictEqual(extractWikilinks("see [[  spaced  ]] for details"), ["spaced"]);
  });

  it("does not extract wikilinks with just heading (regex requires text before #)", () => {
    // The regex [^\]|#]+ requires at least 1 char that isn't ], |, #
    // So [[#section-only]] won't match — the first char after [[ is #
    assert.deepStrictEqual(extractWikilinks("see [[#section-only]]"), []);
  });
});

describe("memoryDir", () => {
  it("returns correct path", () => {
    const result = memoryDir("/some/vault");
    assert.ok(result.endsWith("Claude-Memories"));
    assert.ok(result.includes("vault"));
  });
});
