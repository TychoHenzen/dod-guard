// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import os from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import path from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test, { after } from "node:test";
import { citationCheck } from "./citation-check.mjs";

// A checkout with one file, and outside it a review folder holding the facts
// file and a file next to it that must stay uncitable.
const FACTS_LINES = 2;
const root = mkdtempSync(path.join(os.tmpdir(), "citation-root-"));
const review = mkdtempSync(path.join(os.tmpdir(), "citation-facts-"));
after(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(review, { recursive: true, force: true });
});
writeFileSync(path.join(root, "a.mjs"), "l1\n");
const facts = path.join(review, "git-facts.txt");
const sibling = path.join(review, "brief.json");
writeFileSync(facts, "head 1\nbase 2\n");
writeFileSync(sibling, "{}\n");
const withFacts = citationCheck(root, facts);
const outside = (file) => `${JSON.stringify(file)} is outside the checkout`;

test("the named facts file resolves", () => {
  assert.equal(withFacts(facts, FACTS_LINES), null);
});

test("a line past the end of the facts file is refused", () => {
  const past = `${JSON.stringify(facts)} has 2 lines, so line 3 does not exist`;
  assert.equal(withFacts(facts, FACTS_LINES + 1), past);
});

test("a file next to the facts file is still outside the checkout", () => {
  assert.equal(withFacts(sibling, 1), outside(sibling));
});

test("the facts file is outside the checkout when the check does not name it", () => {
  assert.equal(citationCheck(root)(facts, 1), outside(facts));
});

test("naming a facts file keeps checkout citations as they were", () => {
  assert.equal(withFacts("a.mjs", 1), null);
  assert.equal(withFacts("../a.mjs", 1), outside("../a.mjs"));
});

test("a facts file that does not exist allows nothing", () => {
  const absent = path.join(review, "absent.txt");
  assert.equal(citationCheck(root, absent)(absent, 1), outside(absent));
});
