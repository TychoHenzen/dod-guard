import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./rules-comments-test-support.mjs";

test("reports explicit metadata comments in supported languages", () => {
  for (const [language, code] of [
    ["cs", "// @author old record\npublic class Value {}"],
    ["py", "# @since 1\nvalue = 1\n"],
    ["rs", "/// @date yesterday\npub const VALUE: u8 = 1;"],
    ["ts", "// @author old record\nexport const value = 1;"],
  ]) {
    const found = scan(language, code, "comment-metadata");
    assert.equal(found.length, 1, language);
    assert.equal(found[0].metric, 1, language);
  }
});

test("does not treat ordinary explanatory comments as metadata", () => {
  for (const [language, code] of [
    ["cs", "// The cache is bounded because the provider is remote.\npublic class Value {}"],
    ["py", "# The cache is bounded because the provider is remote.\nvalue = 1\n"],
    ["rs", "/// The cache is bounded because the provider is remote.\npub const VALUE: u8 = 1;"],
    ["ts", "// The cache is bounded because the provider is remote.\nexport const value = 1;"],
  ])
    assert.deepEqual(scan(language, code, "comment-metadata"), []);
});

test("reports deterministic placeholder comments in supported languages", () => {
  for (const [language, code] of [
    ["cs", "// ???\npublic class Value {}"],
    ["py", "# TBD: choose the retry policy\nvalue = 1\n"],
    ["rs", "/// placeholder: choose the retry policy\npub const VALUE: u8 = 1;"],
    ["ts", "// TBA: choose the retry policy\nexport const value = 1;"],
  ]) {
    const found = scan(language, code, "comment-placeholder");
    assert.equal(found.length, 1, language);
    assert.match(found[0].message, /placeholder/);
  }
});

test("does not treat normal prose as a placeholder", () => {
  for (const [language, code] of [
    ["cs", "// The value is intentionally stable across retries\npublic class Value {}"],
    ["py", "# The value is intentionally stable across retries\nvalue = 1\n"],
    ["rs", "/// The value is intentionally stable across retries\npub const VALUE: u8 = 1;"],
    ["ts", "// The value is intentionally stable across retries\nexport const value = 1;"],
  ])
    assert.deepEqual(scan(language, code, "comment-placeholder"), []);
});
