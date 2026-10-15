// A Biome config the scanner cannot judge falls back quietly, and fixing it
// takes effect on the next scan (#871 R3, R4).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  lineFindings,
  lineOf,
  tempTree,
  writeTree,
} from "./formatter-width-test-support.mjs";

const SCANNER = fileURLToPath(
  new URL(
    "../../../../../skills/quality-refactor/scripts/quality-scan.mjs",
    import.meta.url,
  ),
);

const BROKEN_CONFIGS = {
  unparseable: '{ "formatter": { "lineWidth": 120 ',
  "unsupported extends": { extends: "./base.json" },
  "unsupported glob": { formatter: { includes: ["**/*.{ts,js}"] } },
  "lineWidth 0": { formatter: { lineWidth: 0 } },
  "lineWidth 321": { formatter: { lineWidth: 321 } },
  "lineWidth string": { formatter: { lineWidth: "120" } },
};

function assertCliFallback(root, label) {
  const args = [SCANNER, "src", `--root=${root}`, "--format=json"];
  const result = spawnSync(process.execPath, [...args, "--rules=line-length"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, label);
  assert.equal(result.stderr, "", label);
  const found = JSON.parse(result.stdout).violations.map((v) => [
    v.message,
    v.severity,
    v.widthSource,
  ]);
  const fallback = ["line is 100 chars (width 80)", "medium", "default"];
  assert.deepEqual(found, [fallback], label);
}

test("a bad config falls back, exits 0 and writes no stderr", (t) => {
  for (const [label, config] of Object.entries(BROKEN_CONFIGS)) {
    const source = { "src/a.ts": `${lineOf(100)}\n` };
    assertCliFallback(tempTree(t, { ...source, "biome.json": config }), label);
  }
});

test("an unreadable biome.json falls back through the CLI", (t) => {
  const root = tempTree(t, { "src/a.ts": `${lineOf(100)}\n` });
  mkdirSync(join(root, "biome.json"));
  assertCliFallback(root, "directory named biome.json");
});

test("fixing the config takes effect on the next scan", (t) => {
  const root = tempTree(t, {
    "biome.json": "{ broken",
    "src/a.ts": `${lineOf(100)}\n${lineOf(121)}\n`,
  });
  const summary = () =>
    lineFindings(root).map((f) => [f.message, f.widthSource]);
  assert.deepEqual(summary(), [
    ["line is 100 chars (width 80)", "default"],
    ["line is 121 chars (width 80)", "default"],
  ]);
  writeTree(root, { "biome.json": { formatter: { lineWidth: 120 } } });
  assert.deepEqual(summary(), [
    ["line is 121 chars (width 120)", "biome.json"],
  ]);
});
