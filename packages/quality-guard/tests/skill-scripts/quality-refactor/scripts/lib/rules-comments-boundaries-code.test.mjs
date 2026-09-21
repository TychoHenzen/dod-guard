import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./rules-comments-test-support.mjs";

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
