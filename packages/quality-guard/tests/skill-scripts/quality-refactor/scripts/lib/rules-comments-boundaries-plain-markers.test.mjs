import assert from "node:assert/strict";
import { test } from "node:test";
import { scan } from "./rules-comments-test-support.mjs";

test("reports leading plain markers across all supported languages", () => {
  for (const [language, marker, prefix, declaration] of [
    ["cs", "Author: Bob, 2003-04-01", "//", "const value = 1;"],
    ["cs", "Changed on 2004-02-11: fixed bug", "//", "const value = 1;"],
    ["py", "Author: Bob, 2003-04-01", "#", "value = 1"],
    ["py", "Changed on 2004-02-11: fixed bug", "#", "value = 1"],
    ["rs", "Author: Bob, 2003-04-01", "//", "const value = 1;"],
    ["rs", "Changed on 2004-02-11: fixed bug", "//", "const value = 1;"],
    ["ts", "Author: Bob, 2003-04-01", "//", "const value = 1;"],
    ["ts", "Changed on 2004-02-11: fixed bug", "//", "const value = 1;"],
  ]) {
    const found = scan(
      language,
      `${prefix} ${marker}\n${declaration}`,
      "comment-metadata",
    );
    assert.deepEqual(found, [
      {
        file: `src/lib.${language}`,
        line: 1,
        rule: "comment-metadata",
        severity: "medium",
        message: "metadata/history comment belongs in repository records",
        metric: 1,
      },
    ]);
  }
});

test("reports plain markers on their block-comment lines", () => {
  for (const [language, declaration] of [
    ["cs", "int value = 1;"],
    ["rs", "int value = 1;"],
    ["ts", "const value = 1;"],
  ]) {
    const found = scan(
      language,
      `/*\n * Changed on 2004-02-11: fixed bug\n */\n${declaration}`,
      "comment-metadata",
    );
    assert.deepEqual(found, [
      {
        file: `src/lib.${language}`,
        line: 2,
        rule: "comment-metadata",
        severity: "medium",
        message: "metadata/history comment belongs in repository records",
        metric: 1,
      },
    ]);
  }
});

test("keeps metadata-like prose without leading markers quiet", () => {
  for (const [language, prefix, declaration] of [
    ["cs", "//", "public class Value {}"],
    ["py", "#", "value = 1"],
    ["rs", "//", "pub const VALUE: u8 = 1;"],
    ["ts", "//", "export const value = 1;"],
  ]) {
    const code = [
      `${prefix} The author is Bob, 2003-04-01.`,
      `${prefix} This changed on 2004-02-11: fixed bug.`,
      `${prefix} Changed on every render to reflect the active tab.`,
      `${prefix} The date is 2004-02-11 and the author is recorded elsewhere.`,
      `${prefix} Author Bob is mentioned without a marker colon.`,
      declaration,
    ].join("\n");
    assert.deepEqual(scan(language, code, "comment-metadata"), []);
  }
});

test("preserves every existing metadata marker form", () => {
  for (const marker of [
    "@author old record",
    "@version 1",
    "@since 1",
    "@date yesterday",
    "@history old record",
    "created by Bob",
    "last modified by Bob",
    "updated by Bob",
  ]) {
    const found = scan(
      "ts",
      `// ${marker}\nexport const value = 1;`,
      "comment-metadata",
    );
    assert.equal(found.length, 1, marker);
    assert.equal(found[0].rule, "comment-metadata", marker);
    assert.equal(found[0].metric, 1, marker);
  }
});
