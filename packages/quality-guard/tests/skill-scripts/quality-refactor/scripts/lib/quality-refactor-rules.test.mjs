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

const WHITESPACE = /\s+/g;

test("documents the else-branch, wildcard-import, and stateless-method boundaries", () => {
  assert.ok(rules.includes("## `else-branch` - review guard clauses"));
  const sections = [
    [
      "## `wildcard-import`",
      "## `naming-encoding`",
      [
        // biome-ignore lint/security/noSecrets: Rust attribute text, not a credential
        "inside a `#[cfg(test)]` region",
        "matching how per-function rules skip Rust test regions",
        "stays reported",
      ],
    ],
    [
      "## `else-branch`",
      "## `stateless-method`",
      [
        "closes an `if` branch",
        "including `else if`",
        "Rust let-else guards",
        "Python `for`, `while`, and `try` `else` clauses",
        "inside comments or strings",
        "`a if c else b` is still counted",
        "Known limit",
        "options to review",
      ],
    ],
    [
      "## `stateless-method`",
      "## `configurable-data`",
      [
        "TypeScript and JavaScript method signatures without a body",
        "are never reported",
        "A return-type annotation is never taken as the body",
        "Python is unsupported",
      ],
    ],
  ];
  for (const [start, end, signals] of sections) {
    const from = rules.indexOf(start);
    const to = rules.indexOf(end, from);
    assert.notEqual(from, -1, `${start} heading is required`);
    assert.notEqual(to, -1, `${end} heading is required`);
    const section = rules.slice(from, to).replace(WHITESPACE, " ");
    for (const signal of signals) {
      assert.ok(section.includes(signal), `${start} must contain ${signal}`);
    }
  }
});
