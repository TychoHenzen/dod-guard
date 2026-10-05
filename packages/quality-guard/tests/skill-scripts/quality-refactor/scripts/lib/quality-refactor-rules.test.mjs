import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ALL_RULES } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";

const rules = await readFile(
  new URL(
    "../../../../../skills/quality-refactor/reference/rules.md",
    import.meta.url,
  ),
  "utf8",
);

test("file-length guidance keeps partial classes as a documented exception", () => {
  const start = rules.indexOf("## `file-length`");
  const end = rules.indexOf("## `function-length`", start);
  assert.notEqual(start, -1, "file-length heading is required");
  assert.notEqual(end, -1, "function-length heading is required");
  const fileLength = rules.slice(start, end).replace(/\s+/g, " ");
  for (const signal of [
    "Do not introduce partial classes solely to satisfy numeric file or line limits",
    "partial class is appropriate only for a strong, documented",
    "leave a cohesive class alone",
  ]) {
    assert.ok(
      fileLength.includes(signal),
      `file-length guidance must contain ${signal}`,
    );
  }
});

test("the reference matrix covers every configured rule and report-only path", () => {
  const matrixStart = rules.indexOf("## Source and disposition matrix");
  const firstRule = rules.indexOf("## `dead-export`", matrixStart);
  assert.notEqual(matrixStart, -1, "source-and-disposition matrix is required");
  assert.notEqual(firstRule, -1, "rule reference must follow the matrix");
  const matrix = rules.slice(matrixStart, firstRule);

  for (const rule of ALL_RULES) {
    assert.match(
      matrix,
      new RegExp("\\| `" + rule + "` \\|"),
      `${rule} needs a matrix row`,
    );
  }
  assert.match(matrix, /\| `test-quality` \|/);
  assert.match(matrix, /\| `assumption-marker` \|/);
  assert.match(rules, /diagnostic starting points/);
  assert.match(rules, /not universal/);
});

test("documents authority source resolution and dynamic unused-local limits", () => {
  const unusedStart = rules.indexOf("## `unused-local`");
  const unusedEnd = rules.indexOf("## `test-only-export`", unusedStart);
  assert.notEqual(unusedStart, -1, "unused-local heading is required");
  assert.notEqual(unusedEnd, -1, "test-only-export heading is required");
  const unusedLocal = rules.slice(unusedStart, unusedEnd);

  assert.match(rules, /DOD_GUARD_KNOWLEDGE_BASE_DIR/);
  assert.match(rules, /<DOD_GUARD_KNOWLEDGE_BASE_DIR>\/entries\/clean-code/);
  assert.match(
    rules,
    /Do not resolve these paths against the installed Quality Guard plugin/,
  );
  assert.match(unusedLocal, /dynamic TypeScript\/JavaScript lookup/);
  assert.match(unusedLocal, /Review these cases before deleting/);
  assert.match(unusedLocal, /runtime name lookup/);
});
