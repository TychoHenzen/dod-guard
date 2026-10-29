import assert from "node:assert/strict";
import test from "node:test";

import { classifyChanges } from "../../../../../skills/quality-refactor/scripts/lib/pr-gate-compare.mjs";
import { classify, finding, modified } from "./pr-gate-test-support.mjs";

const complexity = (name, value, line = 1) =>
  finding({
    rule: "complexity",
    message: `${name}() cyclomatic complexity ${value}`,
    line,
    metric: value,
  });

test("a finding present at the merge base is not new, even when its line or measure moved", () => {
  const result = classify(
    [complexity("Load", 14, 42)],
    [complexity("Load", 11, 10)],
  );
  assert.equal(result.fresh.length, 0);
  assert.equal(result.existing.length, 1);
  assert.equal(result.resolved.length, 0);
});

test("a different subject is a different finding: the new one is fresh and the old one is resolved", () => {
  const result = classify([complexity("Fresh", 11)], [complexity("Old", 11)]);
  assert.deepEqual(
    result.fresh.map((f) => f.message),
    ["Fresh() cyclomatic complexity 11"],
  );
  assert.deepEqual(
    result.resolved.map((f) => f.message),
    ["Old() cyclomatic complexity 11"],
  );
});

test("repeated findings are matched by count: one extra long line is new", () => {
  const long = (line) => finding({ line });
  const result = classify([long(3), long(9), long(20)], [long(3), long(9)]);
  assert.equal(result.existing.length, 2);
  assert.equal(result.fresh.length, 1);
});

test("a finding that grew is still pre-existing but is reported as worsened", () => {
  const base = [
    finding({ rule: "file-length", message: "file is 325 lines", metric: 325 }),
  ];
  const head = [
    finding({
      rule: "file-length",
      message: "file is 340 lines",
      metric: 340,
      severity: "high",
    }),
  ];
  const result = classify(head, base);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.worsened.length, 1);
  assert.equal(result.worsened[0].was.message, "file is 325 lines");
});

test("an added file has no base, so every finding in it is new", () => {
  const result = classify(
    [finding({ file: "b.cs" })],
    [],
    [{ path: "b.cs", basePath: null }],
  );
  assert.equal(result.fresh.length, 1);
});

test("a renamed file keeps its pre-existing findings through the old path", () => {
  const base = [finding({ file: "old/Name.cs" })];
  const head = [finding({ file: "new/Name.cs" })];
  const result = classify(head, base, [
    { path: "new/Name.cs", basePath: "old/Name.cs" },
  ]);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.existing.length, 1);
});

test("renamed files keep duplicate-block findings naming their paths", () => {
  const pair = (dir) =>
    ["A", "B"].map((name) =>
      finding({
        file: `${dir}/${name}.cs`,
        rule: "duplicate-block",
        message: `6-line block duplicated at ${dir}/A.cs:10, ${dir}/B.cs:20`,
      }),
    );
  const base = pair("old");
  const head = pair("new");
  const result = classify(head, base, [
    { path: "new/A.cs", basePath: "old/A.cs" },
    { path: "new/B.cs", basePath: "old/B.cs" },
  ]);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.existing.length, 2);
});

test("a rename does not rewrite a longer path that ends in its name", () => {
  const message = "6-line block duplicated at src/a.cs:1, src/c.cs:9";
  const kept = finding({ file: "src/c.cs", rule: "duplicate-block", message });
  const result = classify([kept], [kept], [
    { path: "b.cs", basePath: "a.cs" },
    modified("src/c.cs"),
  ]);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.existing.length, 1);
});

test("code moved from one changed file to another is not new", () => {
  const message = "Helper() never touches instance state";
  const base = [finding({ file: "big.cs", rule: "stateless-method", message })];
  const head = [
    finding({ file: "small.cs", rule: "stateless-method", message }),
  ];
  const result = classify(head, base, [
    modified("big.cs"),
    modified("small.cs"),
  ]);
  assert.equal(result.fresh.length, 0);
  assert.equal(result.moved.length, 1);
  assert.equal(result.resolved.length, 0);
});

test("findings in unchanged files and in generated output are ignored", () => {
  const head = [
    finding({ file: "untouched.cs", severity: "high" }),
    finding({ file: "dist/out.js" }),
  ];
  const result = classifyChanges({
    files: [modified("dist/out.js")],
    head,
    base: [],
  });
  assert.equal(result.fresh.length, 0);
});
