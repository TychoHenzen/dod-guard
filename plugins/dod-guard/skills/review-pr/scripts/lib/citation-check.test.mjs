// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import os from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test, { after } from "node:test";
import { citationCheck } from "./citation-check.mjs";

const A_LINES = 3;
const B_LINES = 2;
const root = mkdtempSync(path.join(os.tmpdir(), "citation-check-"));
after(() => rmSync(root, { recursive: true, force: true }));
writeFileSync(path.join(root, "a.mjs"), "l1\nl2\nl3\n");
writeFileSync(path.join(root, "b.mjs"), "l1\nl2");
writeFileSync(path.join(root, "empty.mjs"), "");
mkdirSync(path.join(root, "dir"));

const check = citationCheck(root);
const outsider = path.join(path.dirname(root), "x.mjs");

test("a line inside the file resolves", () => {
  assert.equal(check("a.mjs", A_LINES), null);
});

test("a line past the end of the file is refused", () => {
  assert.equal(check("a.mjs", A_LINES + 1), '"a.mjs" has 3 lines, so line 4 does not exist');
});

test("a last line without a trailing newline still counts", () => {
  assert.equal(check("b.mjs", B_LINES), null);
});

test("a line past a file without a trailing newline is refused", () => {
  assert.equal(check("b.mjs", B_LINES + 1), '"b.mjs" has 2 lines, so line 3 does not exist');
});

test("an empty file has no line to cite", () => {
  assert.equal(check("empty.mjs", 1), '"empty.mjs" has 0 lines, so line 1 does not exist');
});

test("a missing path is not a file", () => {
  assert.equal(check("nope.mjs", 1), '"nope.mjs" is not a file under the checkout');
});

test("a directory is not a file", () => {
  assert.equal(check("dir", 1), '"dir" is not a file under the checkout');
});

test("a description is not a file", () => {
  assert.equal(check("earlier reads", 1), '"earlier reads" is not a file under the checkout');
});

test("a parent-relative path is outside the checkout", () => {
  assert.equal(check("../a.mjs", 1), '"../a.mjs" is outside the checkout');
});

test("an absolute path inside the root resolves", () => {
  assert.equal(check(path.join(root, "a.mjs"), 2), null);
});

test("an absolute path outside the root is refused", () => {
  assert.equal(check(outsider, 1), `${JSON.stringify(outsider)} is outside the checkout`);
});
