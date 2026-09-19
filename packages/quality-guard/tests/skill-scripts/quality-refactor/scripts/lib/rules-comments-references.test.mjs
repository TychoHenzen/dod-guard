import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scan } from "../../../../../skills/quality-refactor/scripts/quality-scan-run.mjs";

function run(source, files = {}, extension = ".ts") {
  const root = mkdtempSync(
    join(process.env.TEMP ?? process.cwd(), "quality-comments-"),
  );
  try {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", `subject${extension}`), source);
    for (const [path, text] of Object.entries(files))
      writeFileSync(join(root, path), text);
    return scan(
      {
        paths: ["src"],
        root,
        excludes: [],
        testPaths: [],
        rules: ["comment-missing-reference"],
      },
      buildConfig("default"),
    ).violations;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

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
    assert.deepEqual(
      run(source, { [`src/target${extension}`]: declaration }, extension),
      [],
    );
    assert.equal(
      run(
        source.replace("#Target", "#Missing"),
        { [`src/target${extension}`]: declaration },
        extension,
      ).length,
      1,
      extension,
    );
  }
});

test("keeps unreadable see evidence unavailable", () => {
  const found = run("// @see src/target.ts#Target\nexport const value = 1;\n", {
    "src/target.ts": Buffer.from([0, 1, 2]),
  });
  assert.deepEqual(found, []);
});

test("finds explicit tags on later lines of a block comment", () => {
  const found = run(
    "/**\n * protocol note\n * @see src/missing.ts#Missing\n */\nexport const value = 1;\n",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test("reports a missing explicit configuration key", () => {
  for (const [extension, source] of [
    [".cs", "// @config config.json:missing\npublic class Value {}"],
    [".py", "# @config config.json:missing\nvalue = 1\n"],
    [".rs", "/// @config config.json:missing\npub const VALUE: u8 = 1;"],
    [".ts", "// @config config.json:missing\nexport const value = 1;\n"],
  ]) {
    const found = run(
      source,
      { "config.json": '{"present": true}\n' },
      extension,
    );
    assert.equal(found.length, 1, extension);
    assert.match(found[0].message, /missing configuration key/);
  }
});

test("accepts explicit configuration keys in supported languages", () => {
  for (const [extension, source] of [
    [".cs", "// @config config.json:present\npublic class Value {}"],
    [".py", "# @config config.json:present\nvalue = 1\n"],
    [".rs", "/// @config config.json:present\npub const VALUE: u8 = 1;"],
    [".ts", "// @config config.json:present\nexport const value = 1;\n"],
  ]) {
    assert.deepEqual(
      run(source, { "config.json": '{"present": true}\n' }, extension),
      [],
    );
  }
});

test("does not confuse a configuration value with a key", () => {
  const found = run(
    "// @config config.json:missing\nexport const value = 1;\n",
    { "config.json": '{"present":"missing"}\n' },
  );
  assert.equal(found.length, 1);
});

test("keeps malformed and unreadable configuration evidence unavailable", () => {
  assert.deepEqual(
    run("// @config config.json:missing\nexport const value = 1;\n", {
      "config.json": '{"present":',
    }),
    [],
  );
  assert.deepEqual(
    run("// @config config.json:missing\nexport const value = 1;\n", {
      "config.json": Buffer.from([0, 1, 2]),
    }),
    [],
  );
});

test("finds config tags on later lines of a block comment", () => {
  const found = run(
    "/**\n * config note\n * @config config.json:missing\n */\nexport const value = 1;\n",
    { "config.json": '{"present": true}\n' },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test("ignores ordinary prose and external see links", () => {
  const found = run(
    "// See https://example.test/docs for the protocol.\nexport const value = 1;\n",
  );
  assert.deepEqual(found, []);
});
