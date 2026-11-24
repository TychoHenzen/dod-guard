import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIG_FILE,
  loadRepoConfig,
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

// The commit gate (TypeScript) and the scanner (script) read one file, so they
// must agree on every key both of them read.
function tsSettings(source) {
  const { excludePaths, registeredAttributes } = parseQualityConfig(source);
  return { excludePaths, registeredAttributes };
}

test("both readers return the same settings", (t) => {
  const cases = [
    ["{}", { excludePaths: [], registeredAttributes: [] }],
    [
      '{"excludePaths":[],"registeredAttributes":[]}',
      { excludePaths: [], registeredAttributes: [] },
    ],
    [
      '{"excludePaths":["/vendor/","\\\\gen\\\\"]}',
      { excludePaths: ["/vendor/", "/gen/"], registeredAttributes: [] },
    ],
    [
      '{"registeredAttributes":["Service","AutoloadAttribute"]}',
      {
        excludePaths: [],
        registeredAttributes: ["Service", "AutoloadAttribute"],
      },
    ],
  ];
  for (const [source, expected] of cases) {
    const fromTs = tsSettings(source);
    assert.deepEqual(fromTs, expected, source);
    assert.deepEqual(loadRepoConfig(rootWith(t, source)), fromTs, source);
  }
});

test("both readers reject a malformed setting", (t) => {
  for (const source of [
    '{"excludePaths":[1]}',
    '{"excludePaths":"x"}',
    '{"excludePaths":[""]}',
    '{"registeredAttributes":"Service"}',
    '{"registeredAttributes":[""]}',
    '{"registeredAttributes":["Godot.Service"]}',
  ]) {
    assert.throws(() => parseQualityConfig(source), undefined, source);
    assert.throws(() => loadRepoConfig(rootWith(t, source)), undefined, source);
  }
});

test("this repository's own setting loads in both readers", () => {
  const expected = {
    excludePaths: ["/packages/code-explorer/fixtures/"],
    registeredAttributes: [],
  };
  assert.deepEqual(loadRepoConfig(REPO_ROOT), expected);
  assert.deepEqual(
    tsSettings(readFileSync(join(REPO_ROOT, CONFIG_FILE), "utf8")),
    expected,
  );
});
