// line-length judged against the Biome width (#871 C3, R2): severity tiers,
// message text, widthSource, and the PR gate's finding identity.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { classifyChanges } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-compare.mjs";
import { checkLines } from "../../../../../skills/quality-refactor/scripts/lib/rules-file-line-check.mjs";
import {
  lineFindings,
  lineOf,
  lineViolations,
  tempTree,
} from "./formatter-width-test-support.mjs";

const SOURCE = `${[90, 100, 121, 130, 141].map(lineOf).join("\n")}\n`;
const AT_80 = {
  90: "medium",
  100: "medium",
  121: "high",
  130: "high",
  141: "high",
};

function severitiesAt(t, files) {
  const findings = lineFindings(tempTree(t, { ...files, "src/a.ts": SOURCE }));
  return Object.fromEntries(findings.map((f) => [f.length, f.severity]));
}

const widthConfig = (lineWidth) => ({
  "biome.json": { formatter: { lineWidth } },
});

test("each width moves medium to W and high to max(W, 120)", (t) => {
  const wide = { 121: "high", 130: "high", 141: "high" };
  assert.deepEqual(severitiesAt(t, widthConfig(120)), wide);
  assert.deepEqual(severitiesAt(t, widthConfig(80)), AT_80);
  assert.deepEqual(severitiesAt(t, widthConfig(140)), { 141: "high" });
});

test("with no config the 80/120 fallback applies", (t) => {
  assert.deepEqual(severitiesAt(t, {}), AT_80);
});

test("the message names the width and widthSource the config", (t) => {
  const root = tempTree(t, {
    ...widthConfig(120),
    "pkg/biome.json": { extends: "//", formatter: { lineWidth: 80 } },
    "src/a.ts": `${lineOf(121)}\n`,
    "pkg/b.ts": `${lineOf(90)}\n`,
    "py/c.py": `${lineOf(90)}\n`,
  });
  const found = lineFindings(root).map((f) => [
    f.file,
    f.severity,
    f.message,
    f.widthSource,
  ]);
  assert.deepEqual(found.sort(), [
    ["pkg/b.ts", "medium", "line is 90 chars (width 80)", "pkg/biome.json"],
    ["py/c.py", "medium", "line is 90 chars (width 80)", "default"],
    ["src/a.ts", "high", "line is 121 chars (width 120)", "biome.json"],
  ]);
});

test("a direct checkLines call with no resolver keeps the fallback", () => {
  const file = { rel: "src/a.ts", lines: [lineOf(90)] };
  const out = [];
  checkLines({ file, config: buildConfig(), out });
  const [finding] = out.filter((v) => v.rule === "line-length");
  assert.deepEqual(
    [finding.severity, finding.message, finding.widthSource],
    ["medium", "line is 90 chars (width 80)", "default"],
  );
});

test("a null high bound stays disabled when a formatter width applies", () => {
  const config = buildConfig();
  config.thresholds["line-length"].high = null;
  const file = { rel: "src/a.ts", lines: [lineOf(90), lineOf(200)] };
  const out = [];
  checkLines({
    file,
    config,
    out,
    widthFor: () => ({ width: 80, source: "x" }),
  });
  const found = out.filter((v) => v.rule === "line-length");
  assert.deepEqual(
    found.map((f) => f.severity),
    ["medium", "medium"],
  );
});

test("findings differing only in widthSource keep one gate identity", (t) => {
  const source = { "src/a.ts": `${lineOf(90)}\n` };
  const head = lineViolations(tempTree(t, { ...source, ...widthConfig(80) }));
  const base = lineViolations(tempTree(t, source));
  assert.deepEqual(
    [head[0].widthSource, base[0].widthSource],
    ["biome.json", "default"],
  );
  const files = [{ path: "src/a.ts", basePath: "src/a.ts" }];
  const result = classifyChanges({ files, head, base });
  assert.equal(result.existing.length, 1);
  assert.deepEqual([result.fresh, result.resolved], [[], []]);
});
