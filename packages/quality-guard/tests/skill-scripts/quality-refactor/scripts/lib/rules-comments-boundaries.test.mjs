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
    [
      "cs",
      "// The cache is bounded because the provider is remote.\npublic class Value {}",
    ],
    [
      "py",
      "# The cache is bounded because the provider is remote.\nvalue = 1\n",
    ],
    [
      "rs",
      "/// The cache is bounded because the provider is remote.\npub const VALUE: u8 = 1;",
    ],
    [
      "ts",
      "// The cache is bounded because the provider is remote.\nexport const value = 1;",
    ],
  ]) {
    assert.deepEqual(scan(language, code, "comment-metadata"), []);
  }
});

test("reports deterministic placeholder comments in supported languages", () => {
  for (const [language, code] of [
    ["cs", "// ???\npublic class Value {}"],
    ["py", "# TBD: choose the retry policy\nvalue = 1\n"],
    [
      "rs",
      "/// placeholder: choose the retry policy\npub const VALUE: u8 = 1;",
    ],
    ["ts", "// TBA: choose the retry policy\nexport const value = 1;"],
  ]) {
    const found = scan(language, code, "comment-placeholder");
    assert.equal(found.length, 1, language);
    assert.match(found[0].message, /placeholder/);
  }
});

test("does not treat normal prose as a placeholder", () => {
  for (const [language, code] of [
    [
      "cs",
      "// The value is intentionally stable across retries\npublic class Value {}",
    ],
    ["py", "# The value is intentionally stable across retries\nvalue = 1\n"],
    [
      "rs",
      "/// The value is intentionally stable across retries\npub const VALUE: u8 = 1;",
    ],
    [
      "ts",
      "// The value is intentionally stable across retries\nexport const value = 1;",
    ],
  ]) {
    assert.deepEqual(scan(language, code, "comment-placeholder"), []);
  }
});

test("keeps restatement findings covered across supported languages", () => {
  for (const [language, code] of [
    ["cs", "// The user name.\npublic string UserName { get; set; }"],
    ["py", "# The user name.\nuser_name = value\n"],
    ["rs", "/// The user name.\npub user_name: String,"],
    ["ts", "// The user name.\nconst userName = value;"],
  ]) {
    assert.equal(
      scan(language, code, "comment-restates-code").length,
      1,
      language,
    );
    assert.deepEqual(
      scan(
        language,
        code.replace(
          /The user name\./,
          "The user name is normalized for the wire format.",
        ),
        "comment-restates-code",
      ),
      [],
    );
  }
});

test("keeps commented-out-code findings covered across supported languages", () => {
  for (const [language, code] of [
    ["cs", "// return value;\npublic int Value() { return 1; }"],
    ["py", "# return value;\ndef value():\n    return 1\n"],
    ["rs", "// return value;\npub fn value() -> i32 { 1 }"],
    ["ts", "// return value;\nexport function value() { return 1; }"],
  ]) {
    assert.equal(
      scan(language, code, "commented-out-code").length,
      1,
      language,
    );
    assert.deepEqual(
      scan(
        language,
        code.replace("return value;", "the value is explained below"),
        "commented-out-code",
      ),
      [],
    );
  }
});

test("finds metadata and placeholders after prose in block comments", () => {
  const metadata = scan(
    "ts",
    "/**\n * protocol history\n * @author old record\n */\nexport const value = 1;",
    "comment-metadata",
  );
  const placeholder = scan(
    "ts",
    "/*\n * protocol note\n * TBD: choose a policy\n */\nexport const value = 1;",
    "comment-placeholder",
  );
  assert.equal(metadata.length, 1);
  assert.equal(placeholder.length, 1);
});
