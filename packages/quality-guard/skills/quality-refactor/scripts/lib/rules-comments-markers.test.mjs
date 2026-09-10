import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { scanFile } from "./rules-file.mjs";

function scan(code, rule) {
  const file = {
    rel: "src/lib.ts",
    lang: "ts",
    isTest: false,
    source: code,
    lines: code.split("\n"),
  };
  return scanFile(file, buildConfig("default")).violations.filter(
    (violation) => violation.rule === rule,
  );
}

test("a TODO marker is still reported", () => {
  assert.equal(
    scan("// TODO: wire this up\nexport const a = 1;\n", "todo-marker").length,
    1,
  );
});

test("commented-out code is still reported", () => {
  assert.equal(
    scan(
      "export const a = 1;\n// const b = compute(a);\n",
      "commented-out-code",
    ).length,
    1,
  );
});

test("ASSUMPTION does not match the todo-marker regex", () => {
  const code =
    "// ASSUMPTION: the API returns ids in insertion order\n" +
    "export const a = 1;\n";
  assert.deepEqual(scan(code, "todo-marker"), []);
});

test("a comment with both markers takes the todo branch", () => {
  const code =
    "// ASSUMPTION: TODO revisit this once the API is confirmed\n" +
    "export const a = 1;\n";
  assert.equal(scan(code, "todo-marker").length, 1);
});

test("the assumption marker fires once", () => {
  const code =
    "// ASSUMPTION: the API returns ids in insertion order\n" +
    "export const a = 1;\n";
  const found = scan(code, "assumption-marker");
  assert.equal(found.length, 1);
  assert.equal(found[0].metric, 1);
});

test("both marker rules measure the same comment independently", () => {
  const code =
    "// ASSUMPTION: TODO revisit this once the API is confirmed\n" +
    "export const a = 1;\n";
  assert.equal(scan(code, "assumption-marker").length, 1);
  assert.equal(scan(code, "todo-marker").length, 1);
});

test("an ordinary comment fires neither marker rule", () => {
  const code =
    "// clamp the batch size before sending the request\nexport const a = 1;\n";
  assert.deepEqual(scan(code, "assumption-marker"), []);
  assert.deepEqual(scan(code, "todo-marker"), []);
});
