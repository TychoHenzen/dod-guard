import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "./rules-comments-references-support.mjs";

test("reports a missing explicit see target", () => {
  for (const [extension, source] of [
    [".cs", "// @see src/missing.ts#Missing\npublic class Value {}"],
    [".py", "# @see src/missing.ts#Missing\nvalue = 1\n"],
    [".rs", "/// @see src/missing.ts#Missing\npub const VALUE: u8 = 1;"],
    [".ts", "// @see src/missing.ts#Missing\nexport const value = 1;\n"],
  ]) {
    const found = run(source, {}, extension);
    assert.equal(found.length, 1, extension);
    assert.match(found[0].message, /missing repository target/);
  }
});

test("accepts an explicit see target and symbol", () => {
  const found = run("// @see src/target.ts#Target\nexport const value = 1;\n", {
    "src/target.ts": "export class Target {}\n",
  });
  assert.deepEqual(found, []);
});

test("accepts dollar-prefixed symbols", () => {
  const found = run(
    "// @see src/target.ts#$Target\nexport const value = 1;\n",
    { "src/target.ts": "export const $Target = true;\n" },
  );
  assert.deepEqual(found, []);
});

test("checks explicit symbols across supported languages", () => {
  for (const [extension, marker, declaration] of [
    [".cs", "//", "public class Target {}\n"],
    [".py", "#", "class Target:\n    pass\n"],
    [".rs", "///", "pub struct Target;\n"],
    [".ts", "//", "export class Target {}\n"],
  ]) {
    const target = `src/target${extension}#Target`;
    const source = `${marker} @see ${target}\nexport const value = 1;\n`;
    assert.deepEqual(run(source, { [`src/target${extension}`]: declaration }, extension), [], extension);
    assert.equal(
      run(source.replace("#Target", "#Missing"), { [`src/target${extension}`]: declaration }, extension).length,
      1,
      extension,
    );
  }
});
