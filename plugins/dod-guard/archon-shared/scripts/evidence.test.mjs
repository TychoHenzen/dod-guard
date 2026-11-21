import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { citationProblem, formatCitation } from "./evidence.mjs";
import { scratch } from "./testing.mjs";

function repo(t) {
  const root = scratch(t, "evidence-");
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "guide.md"), "# Guide\n\nRun `tool --fast`.\n");
  return root;
}

test("a cited file, line range and anchor that exist hold", (t) => {
  const root = repo(t);
  assert.equal(citationProblem(root, { path: "docs/guide.md", line: 1, end: 3, anchor: "--fast" }), null);
  assert.equal(
    formatCitation({ path: "docs/guide.md", line: 1, end: 3, anchor: "--fast" }),
    "docs/guide.md:1-3 (--fast)",
  );
});

test("a missing file, a directory with a line, and a reversed range are each named", (t) => {
  const root = repo(t);
  assert.match(citationProblem(root, { path: "docs/none.md" }), /cited file docs\/none\.md does not exist/);
  assert.match(citationProblem(root, { path: "docs/guide.md/x" }), /does not exist/);
  assert.equal(citationProblem(root, { path: "docs" }), null);
  assert.match(citationProblem(root, { path: "docs", line: 1 }), /is a directory, so it has no lines/);
  assert.match(citationProblem(root, { path: "docs/guide.md", line: 3, end: 2 }), /a range needs line <= end/);
  assert.match(citationProblem(root, { path: "docs/guide.md", anchor: " " }), /an anchor must be non-empty text/);
});
