// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  normalizeGitHubHierarchy,
  normalizeGitHubReviewThreads,
  parseAzureReport,
  redactSecrets,
  updateAzureReport,
} from "./lib/fix-support.mjs";

const CHILD_ISSUE_NUMBER = 34;
const FIXED_FINDING = /ADO-7-1[\s\S]*Status: Fixed[\s\S]*Commit: abc123[\s\S]*Verification: npm test/;
const MISSING_GITHUB_FINDING = /GH-99/;
const OPEN_FINDING = /ADO-7-2[\s\S]*Status: Open/;
const STALE_STATUS = /not open/;

test("selects unresolved GitHub review findings with provider identifiers", () => {
  const payload = { reviewThreads: [{
    comments: [{ body: "Fix the branch check", commit: { oid: "abc123" }, databaseId: 41, url: "https://example.test/41" }],
    id: "PRRT_1",
    isOutdated: false,
    isResolved: false,
    line: 20,
    path: "src/review.js",
  }] };

  assert.deepEqual(normalizeGitHubReviewThreads(payload, ["GH-41"]), [{
    body: "Fix the branch check",
    commentId: 41,
    commitSha: "abc123",
    file: "src/review.js",
    id: "GH-41",
    isOutdated: false,
    isResolved: false,
    line: 20,
    reviewState: "open",
    threadId: "PRRT_1",
    url: "https://example.test/41",
  }]);
});

test("rejects a selected GitHub finding that is absent", () => {
  assert.throws(() => normalizeGitHubReviewThreads({ reviewThreads: [] }, ["GH-99"]), MISSING_GITHUB_FINDING);
});

test("marks outdated GitHub findings stale before implementation", () => {
  const payload = {
    reviewThreads: [{
      comments: [{ body: "Old claim", databaseId: 42 }],
      id: "PRRT_2",
      isOutdated: true,
      isResolved: false,
      line: null,
      path: "src/old.js",
    }],
  };

  assert.equal(normalizeGitHubReviewThreads(payload, ["GH-42"])[0].reviewState, "stale");
});

test("parses and selects Azure report findings", () => {
  const findings = parseAzureReport(azureReport(), ["ADO-7-1"]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    correction: "Validate the ref before use.",
    file: "src/review.js",
    id: "ADO-7-1",
    impact: "A wrong ref is reviewed.",
    line: 20,
    problem: "Target ref is trusted.",
    requirement: "AC 2",
    rootCause: "Unvalidated target ref",
    severity: "MAJOR",
    status: "Open",
  });
});

test("normalizes the parent PBI and linked sub-issues", () => {
  const result = normalizeGitHubHierarchy({
    body: "## Outcome\nWorks.\n\n## Acceptance criteria\n- [ ] Visible result\n",
    number: 33,
    state: "OPEN",
    subIssues: { nodes: [{ body: "Details", number: 34, state: "OPEN", title: "Fix findings" }] },
    title: "Review pull requests",
  });
  assert.equal(result.acceptanceCriteria, "- [ ] Visible result");
  assert.equal(result.workItems[0].number, CHILD_ISSUE_NUMBER);
});

test("redacts credentials from nested finding context", () => {
  const token = ["ghp", "aaaaaaaaaaaaaaaaaaaa"].join("_");
  const redacted = redactSecrets({ body: `Authorization: Bearer ${token}`, nested: ["?access_token=value"] });
  assert.equal(JSON.stringify(redacted).includes("aaaaaaaa"), false);
  assert.equal(JSON.stringify(redacted).includes("access_token=value"), false);
});

test("updates only the fixed Azure entry and preserves unresolved entries", () => {
  const original = azureReport();
  const updated = updateAzureReport(original, {
    "ADO-7-1": { commit: "abc123", verification: "npm test" },
  });
  assert.match(updated, FIXED_FINDING);
  assert.match(updated, OPEN_FINDING);
  assert.equal(updated.slice(updated.indexOf("### ADO-7-2")), original.slice(original.indexOf("### ADO-7-2")));
});

test("rejects stale Azure status updates", () => {
  const fixed = azureReport().replace("- Status: Open", "- Status: Fixed");
  assert.throws(() => updateAzureReport(fixed, { "ADO-7-1": { commit: "abc", verification: "test" } }), STALE_STATUS);
});

function azureReport() {
  return [
    "# Azure DevOps PR 7 review",
    "",
    "- Head: abc123",
    "",
    "## Findings",
    "",
    "### ADO-7-1: MAJOR Target ref is trusted.",
    "",
    "- Location: `src/review.js:20`",
    "- Impact: A wrong ref is reviewed.",
    "- Requirement: AC 2",
    "- Correction: Validate the ref before use.",
    "- Root cause: Unvalidated target ref",
    "- Status: Open",
    "",
    "### ADO-7-2: MINOR Name is vague.",
    "",
    "- Location: `src/name.js:5`",
    "- Impact: Maintenance is slower.",
    "- Requirement: repository rule",
    "- Correction: Rename it.",
    "- Root cause: Vague name",
    "- Status: Open",
    "",
  ].join("\n");
}
