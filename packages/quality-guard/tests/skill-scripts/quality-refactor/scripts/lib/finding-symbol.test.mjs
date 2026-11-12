import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildConfig,
} from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import {
  scanFile,
} from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";

// The language is the file extension: "a.ts" is TypeScript, "a.py" Python.
function scan(rel, code, thresholds) {
  const config = buildConfig();
  config.thresholds = { ...config.thresholds, ...thresholds };
  const file = {
    rel,
    lang: rel.split(".").pop(),
    isTest: false,
    source: code,
    lines: code.split("\n"),
  };
  return scanFile(file, config).violations;
}

function at(found, rule, line) {
  return found.find(
    (violation) => violation.rule === rule && violation.line === line,
  );
}

const LONG_LINES = [
  'const TOP_LEVEL_CONSTANT = "a string that is long";',
  "function alpha() {",
  '  return "a long string inside alpha...";',
  "}",
  "function beta() {",
  '  return "a long string inside beta....";',
  "}",
].join("\n");

const LONG_LINE_THRESHOLDS = { "line-length": { medium: 30, high: 300 } };

test("a long line takes the name of the function around it", () => {
  const found = scan("a.ts", LONG_LINES, LONG_LINE_THRESHOLDS);
  assert.equal(at(found, "line-length", 3).symbol, "alpha");
  assert.equal(at(found, "line-length", 6).symbol, "beta");
});

test("a finding outside every function has no symbol", () => {
  const found = scan("a.ts", LONG_LINES, LONG_LINE_THRESHOLDS);
  assert.equal("symbol" in at(found, "line-length", 1), false);
});

test("file-length carries no symbol", () => {
  const found = scan("a.ts", LONG_LINES, {
    "file-length": { medium: 3, high: 300 },
  });
  assert.equal("symbol" in at(found, "file-length", 1), false);
});

test("the innermost function wins, even on a header line", () => {
  const code = [
    "function outer() {",
    "  function inner() {",
    "    if (a) return 1;",
    "    return 2;",
    "  }",
    "  return inner();",
    "}",
    "function other() {",
    "  return 1;",
    "}",
  ].join("\n");
  const found = scan("a.ts", code, {
    complexity: { medium: 0, high: 0 },
  });
  assert.equal(at(found, "complexity", 1).symbol, "outer");
  assert.equal(at(found, "complexity", 2).symbol, "inner");
  assert.equal(at(found, "complexity", 8).symbol, "other");
});

test("a Python def gets a symbol", () => {
  const code = [
    'TOP = "a string that is long, ok...."',
    "",
    "def alpha():",
    '    return "a long string inside alpha..."',
    "",
    "",
    "def beta():",
    '    return "a long string inside beta...."',
  ].join("\n");
  const found = scan("a.py", code, LONG_LINE_THRESHOLDS);
  assert.equal("symbol" in at(found, "line-length", 1), false);
  assert.equal(at(found, "line-length", 4).symbol, "alpha");
  assert.equal(at(found, "line-length", 8).symbol, "beta");
});
