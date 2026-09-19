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

test("reports a missing explicit configuration key", () => {
  const found = run(
    "// @config config.json:missing\nexport const value = 1;\n",
    { "config.json": '{"present": true}\n' },
  );
  assert.equal(found.length, 1);
  assert.match(found[0].message, /missing configuration key/);
});

test("does not confuse a configuration value with a key", () => {
  const found = run(
    "// @config config.json:missing\nexport const value = 1;\n",
    { "config.json": '{"present":"missing"}\n' },
  );
  assert.equal(found.length, 1);
});

test("ignores ordinary prose and external see links", () => {
  const found = run(
    "// See https://example.test/docs for the protocol.\nexport const value = 1;\n",
  );
  assert.deepEqual(found, []);
});
