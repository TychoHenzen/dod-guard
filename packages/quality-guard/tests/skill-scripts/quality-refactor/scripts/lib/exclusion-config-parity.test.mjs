import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIG_FILE,
  loadExcludePaths,
} from "../../../../../skills/quality-refactor/scripts/lib/exclusion-config.mjs";

const { parseQualityConfig } = await import(
  new URL("../../../../../dist-test/src/commit-gate/config.js", import.meta.url)
);

const REPO_ROOT = fileURLToPath(
  new URL("../../../../../../../", import.meta.url),
);

function rootWith(t, source) {
  const dir = mkdtempSync(join(tmpdir(), "exclusion-parity-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, CONFIG_FILE), source);
  return dir;
}

test("both readers return the same list", (t) => {
  const cases = [
    ["{}", []],
    ['{"excludePaths":[]}', []],
    ['{"excludePaths":["/vendor/","\\\\gen\\\\"]}', ["/vendor/", "/gen/"]],
  ];
  for (const [source, expected] of cases) {
    const fromTs = parseQualityConfig(source).excludePaths;
    assert.deepEqual(fromTs, expected, source);
    assert.deepEqual(loadExcludePaths(rootWith(t, source)), fromTs, source);
  }
});

test("both readers reject a malformed excludePaths", (t) => {
  for (const source of [
    '{"excludePaths":[1]}',
    '{"excludePaths":"x"}',
    '{"excludePaths":[""]}',
  ]) {
    assert.throws(() => parseQualityConfig(source), undefined, source);
    assert.throws(
      () => loadExcludePaths(rootWith(t, source)),
      undefined,
      source,
    );
  }
});

test("this repository's own setting loads in both readers", () => {
  const expected = ["/packages/code-explorer/fixtures/"];
  assert.deepEqual(loadExcludePaths(REPO_ROOT), expected);
  assert.deepEqual(
    parseQualityConfig(readFileSync(join(REPO_ROOT, CONFIG_FILE), "utf8"))
      .excludePaths,
    expected,
  );
});
