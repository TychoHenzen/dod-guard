// AC-9 of #871: resolving the Biome width only removes line-length findings
// and never changes the high set. Pinned on a generated tree because a
// full-repo count drifts.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lineFindings,
  lineOf,
  tempTree,
} from "./formatter-width-test-support.mjs";

const LENGTHS = [70, 81, 90, 100, 119, 120, 121, 130, 150];
const SOURCE = `${LENGTHS.map(lineOf).join("\n")}\n`;
const key = (finding) => `${finding.file}:${finding.length}`;
const keysOf = (findings) => new Set(findings.map(key));
const highKeys = (findings) =>
  keysOf(findings.filter((f) => f.severity === "high"));

function findingsAt(t, lineWidth) {
  return lineFindings(
    tempTree(t, {
      "biome.json": { formatter: { lineWidth } },
      "src/a.ts": SOURCE,
    }),
  );
}

test("a wider Biome width never adds a line-length finding", (t) => {
  const fallback = lineFindings(tempTree(t, { "src/a.ts": SOURCE }));
  const fallbackKeys = keysOf(fallback);
  for (const width of [100, 120, 140]) {
    const resolved = findingsAt(t, width);
    for (const k of keysOf(resolved)) {
      assert.ok(fallbackKeys.has(k), `width ${width} adds ${k}`);
    }
    if (width === 120 || width === 140) {
      assert.ok(resolved.length < fallback.length);
    }
  }
});

test("width 120 keeps the same high findings as the fallback", (t) => {
  const fallback = lineFindings(tempTree(t, { "src/a.ts": SOURCE }));
  const resolved = findingsAt(t, 120);
  assert.deepEqual(
    [...highKeys(resolved)].sort(),
    [...highKeys(fallback)].sort(),
  );
});
