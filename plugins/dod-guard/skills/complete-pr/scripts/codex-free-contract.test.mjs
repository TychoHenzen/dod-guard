// The owner's rule: no delivery surface requests or waits for a Codex review.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { readFile } from "node:fs/promises";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { prose } from "../../../lib/skill-text.mjs";

const pluginRoot = new URL("../../../", import.meta.url);
const DOCUMENTS = [
  "skills/submit-draft-pr/SKILL.md",
  "skills/complete-pr/SKILL.md",
  "skills/quick-pbi/SKILL.md",
  "standards/conflict-triage.md",
  "AGENTS.md",
  "README.md",
];

async function readDocument(path) {
  return [path, await readFile(new URL(path, pluginRoot), "utf8")];
}

const documents = new Map(await Promise.all(DOCUMENTS.map(readDocument)));

// Bracketed so that this file never contains the at-mention it forbids.
const AT_MENTION = /@[c]odex\b/i;
const CODEX_REVIEW = /codex(?:'s)?\s+(?:code\s+)?review/i;
const RETIRED_PATTERNS = [
  AT_MENTION,
  /^## Request the Codex review/im,
  CODEX_REVIEW,
  /codex-review-/i,
  /codex-summary-unrecognized/i,
  /chatgpt-codex-connector/i,
];

test("no delivery document asks for or waits on a Codex review", () => {
  for (const [path, text] of documents) {
    for (const pattern of RETIRED_PATTERNS) {
      assert.doesNotMatch(text, pattern, `${path} matches ${pattern}`);
    }
  }
});

test("complete-pr names both thread stop codes", () => {
  const path = "skills/complete-pr/SKILL.md";
  assert.match(documents.get(path), prose("`unresolved-review-threads`"), path);
  assert.match(documents.get(path), prose("`review-threads-unavailable`"), path);
});

test("quick-pbi hands an unresolved review thread back to complete-pr", () => {
  const path = "skills/quick-pbi/SKILL.md";
  assert.match(documents.get(path), prose("`unresolved-review-threads`"), path);
});

test("submit-draft-pr keeps its retry rule after the review request section is removed", () => {
  const path = "skills/submit-draft-pr/SKILL.md";
  assert.match(
    documents.get(path),
    prose("If pull-request creation or update fails, times out, or returns ambiguously"),
    path,
  );
});
