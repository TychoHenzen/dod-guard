import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "./rules-comments-references-support.mjs";

test("reports a missing explicit configuration key", () => {
  for (const [extension, source] of [
    [".cs", "// @config config.json:missing\npublic class Value {}"],
    [".py", "# @config config.json:missing\nvalue = 1\n"],
    [".rs", "/// @config config.json:missing\npub const VALUE: u8 = 1;"],
    [".ts", "// @config config.json:missing\nexport const value = 1;\n"],
  ]) {
    const found = run(source, { "config.json": '{"present": true}\n' }, extension);
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
  ])
    assert.deepEqual(run(source, { "config.json": '{"present": true}\n' }, extension), []);
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
