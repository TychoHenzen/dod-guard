// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { normalizeGitHubHierarchy } from "./lib/fix-support.mjs";

const FENCED_BODY = [
  "## Outcome",
  "Works.",
  "",
  "```",
  "## Acceptance criteria",
  "- [ ] example",
  "```",
  "",
  "## Acceptance criteria",
  "- [ ] real",
  "",
].join("\n");

test("ignores an Acceptance criteria heading inside a code fence", () => {
  const result = normalizeGitHubHierarchy({
    body: FENCED_BODY,
    number: 33,
    state: "OPEN",
    title: "Review pull requests",
  });
  assert.equal(result.acceptanceCriteria, "- [ ] real");
});

test("does not read a lower-case acceptance criteria heading", () => {
  const result = normalizeGitHubHierarchy({
    body: "## acceptance criteria\n- [ ] x\n",
    number: 33,
    state: "OPEN",
    title: "Review pull requests",
  });
  assert.equal(result.acceptanceCriteria, "");
});
