import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { scanFile } from "./rules-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "target");
const STRICT = buildConfig("strict");

function loadFixture(name, lang) {
  const source = readFileSync(join(FIXTURES, name), "utf8");
  return {
    rel: name,
    lang,
    isTest: false,
    source,
    lines: source.split(/\r?\n/),
  };
}

function violationSet(name, lang) {
  const { violations } = scanFile(loadFixture(name, lang), STRICT);
  return violations
    .map((violation) => ({
      file: violation.file,
      line: violation.line,
      rule: violation.rule,
    }))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.rule.localeCompare(b.rule),
    );
}

test("Rust fixture reports its exact violation set", () => {
  assert.deepEqual(violationSet("sample.rs", "rs"), [
    { file: "sample.rs", line: 18, rule: "complexity" },
    { file: "sample.rs", line: 29, rule: "stateless-method" },
    { file: "sample.rs", line: 36, rule: "else-branch" },
    { file: "sample.rs", line: 44, rule: "comment-bloat" },
    { file: "sample.rs", line: 58, rule: "todo-marker" },
  ]);
});

test("Rust plain-string captures do not invent unused-local violations", () => {
  const { violations, interpolations } = scanFile(
    loadFixture("sample.rs", "rs"),
    STRICT,
  );
  assert.equal(
    interpolations.some((id) => id.name === "phantom"),
    true,
  );
  assert.equal(
    violations.some(
      (v) => v.rule === "unused-local" && v.message.includes("phantom"),
    ),
    false,
  );
});

test("C# fixture reports its exact violation set", () => {
  assert.deepEqual(violationSet("Sample.cs", "cs"), [
    { file: "Sample.cs", line: 32, rule: "stateless-method" },
    { file: "Sample.cs", line: 42, rule: "else-branch" },
    { file: "Sample.cs", line: 42, rule: "stateless-method" },
  ]);
});

test("C# auto-properties count as fields", () => {
  const { violations } = scanFile(loadFixture("Sample.cs", "cs"), STRICT);
  assert.equal(
    violations.some(
      (v) =>
        v.rule === "stateless-method" && v.message.startsWith("Summarize()"),
    ),
    false,
  );
});
