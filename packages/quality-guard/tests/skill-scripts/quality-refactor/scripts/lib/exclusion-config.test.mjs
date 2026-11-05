import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CONFIG_FILE,
  ExclusionConfigError,
  loadExcludePaths,
} from "../../../../../skills/quality-refactor/scripts/lib/exclusion-config.mjs";

// One temp directory per case; `text` is written as the config file when given.
function rootWith(t, text) {
  const root = mkdtempSync(join(tmpdir(), "exclusion-config-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (text !== undefined) writeFileSync(join(root, CONFIG_FILE), text);
  return root;
}

const isConfigError = (error) =>
  error instanceof ExclusionConfigError &&
  /\.quality-guard\.json/.test(error.message);

test("a missing file adds no exclusion", (t) => {
  assert.deepEqual(loadExcludePaths(rootWith(t)), []);
});

test("excludePaths is returned as written", (t) => {
  const text = JSON.stringify({ excludePaths: ["/vendor/", "\\gen\\"] });
  assert.deepEqual(loadExcludePaths(rootWith(t, text)), ["/vendor/", "/gen/"]);
});

test("a file without the key adds none", (t) => {
  const text = JSON.stringify({ pathGroups: {} });
  assert.deepEqual(loadExcludePaths(rootWith(t, text)), []);
});

test("invalid JSON is an error naming the file", (t) => {
  assert.throws(() => loadExcludePaths(rootWith(t, "{")), isConfigError);
});

test("a non-array or non-string entry is an error", (t) => {
  for (const excludePaths of ["x", [1], [""]]) {
    const text = JSON.stringify({ excludePaths });
    assert.throws(
      () => loadExcludePaths(rootWith(t, text)),
      ExclusionConfigError,
      JSON.stringify(excludePaths),
    );
  }
});
