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

function violationSet(name, lang) {
  const source = readFileSync(join(FIXTURES, name), "utf8");
  const file = {
    rel: name,
    lang,
    isTest: false,
    source,
    lines: source.split(/\r?\n/),
  };
  return scanFile(file, STRICT)
    .violations.map((violation) => ({
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

test("Go fixture reports its exact violation set", () => {
  assert.deepEqual(violationSet("sample.go", "go"), [
    { file: "sample.go", line: 25, rule: "else-branch" },
    { file: "sample.go", line: 37, rule: "todo-marker" },
  ]);
});

test("Java fixture reports its exact violation set", () => {
  assert.deepEqual(violationSet("Sample.java", "java"), [
    { file: "Sample.java", line: 26, rule: "else-branch" },
    { file: "Sample.java", line: 26, rule: "stateless-method" },
  ]);
});

test("C++ fixture reports its exact violation set", () => {
  assert.deepEqual(violationSet("sample.cpp", "cpp"), [
    { file: "sample.cpp", line: 28, rule: "else-branch" },
    { file: "sample.cpp", line: 28, rule: "stateless-method" },
  ]);
});

test("C++ private fields count as instance state", () => {
  const source = readFileSync(join(FIXTURES, "sample.cpp"), "utf8");
  const file = {
    rel: "sample.cpp",
    lang: "cpp",
    isTest: false,
    source,
    lines: source.split(/\r?\n/),
  };
  const { violations } = scanFile(file, STRICT);
  assert.equal(
    violations.some(
      (v) =>
        v.rule === "stateless-method" && v.message.startsWith("summarize()"),
    ),
    false,
  );
});

test("Python fixture reports its exact violation set", () => {
  assert.deepEqual(violationSet("sample.py", "py"), [
    { file: "sample.py", line: 13, rule: "else-branch" },
    { file: "sample.py", line: 23, rule: "unnamed-tuple" },
    { file: "sample.py", line: 27, rule: "todo-marker" },
  ]);
});
