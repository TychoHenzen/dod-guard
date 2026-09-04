// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  dedupeFindings,
  normalizeAzureHierarchy,
  normalizeGitHubHierarchy,
  normalizeReviewTarget,
  redactSecrets,
  renderAzureReport,
  validateFindingLines,
} from "./lib/review-support.mjs";

test("normalizes current, named, GitHub, and Azure targets", () => {
  assert.deepEqual(normalizeReviewTarget("", "codex/33-review-pr"), {
    provider: "git",
    ref: "codex/33-review-pr",
    source: "current-branch",
  });
  assert.deepEqual(normalizeReviewTarget("origin/topic", "ignored"), {
    provider: "git",
    ref: "origin/topic",
    source: "named-ref",
  });
  assert.deepEqual(normalizeReviewTarget("https://github.com/acme/widget/pull/19", "ignored"), {
    owner: "acme",
    provider: "github",
    pullNumber: 19,
    repository: "widget",
  });
  assert.deepEqual(normalizeReviewTarget("https://dev.azure.com/acme/Widget/_git/api/pullrequest/7", "ignored"), {
    organization: "acme",
    project: "Widget",
    provider: "azure",
    pullNumber: 7,
    repository: "api",
  });
});

test("normalizes GitHub PBI acceptance criteria and sub-issues", () => {
  const result = normalizeGitHubHierarchy({
    body: "## Outcome\nWorks.\n\n## Acceptance criteria\n- [ ] Visible result\n\n## Verification\nRun it.",
    number: 33,
    subIssues: { nodes: [{ body: "Details", number: 34, state: "OPEN", title: "Fix findings" }] },
    title: "Review pull requests",
  });

  assert.equal(result.acceptanceCriteria, "- [ ] Visible result");
  assert.deepEqual(result.workItems, [
    { body: "Details", number: 34, state: "OPEN", title: "Fix findings", url: undefined },
  ]);
});

test("normalizes Azure PBI fields and child work items", () => {
  const result = normalizeAzureHierarchy(
    {
      fields: {
        "Microsoft.VSTS.Common.AcceptanceCriteria": "<p>Visible &amp; correct</p>",
        "System.Description": "<p>Review it</p>",
        "System.Title": "Review pull requests",
      },
      id: 41,
    },
    [{ fields: { "System.Description": "<p>Child</p>", "System.State": "Done", "System.Title": "Load PBI" }, id: 42 }],
  );

  assert.equal(result.acceptanceCriteria, "Visible & correct");
  assert.deepEqual(result.workItems[0], {
    body: "Child",
    number: 42,
    state: "Done",
    title: "Load PBI",
    url: undefined,
  });
});

test("redacts provider credentials throughout a review context", () => {
  const fakeGitHubToken = ["ghp", "aaaaaaaaaaaaaaaaaaaa"].join("_");
  const redacted = redactSecrets({
    github: `Authorization: Bearer ${fakeGitHubToken}`,
    nested: ["https://example.test/?access_token=secret-value", "AZURE_DEVOPS_EXT_PAT=another-secret"],
  });

  assert.equal(JSON.stringify(redacted).includes("secret"), false);
  assert.ok(redacted.github.includes("[REDACTED]"));
});

test("accepts only changed final-state lines and explicit PR-level findings", () => {
  const diff = [
    "diff --git a/src/a.js b/src/a.js",
    "--- a/src/a.js",
    "+++ b/src/a.js",
    "@@ -2,2 +2,3 @@",
    " unchanged",
    "+added",
    " final",
  ].join("\n");
  const findings = [
    { file: "src/a.js", line: 3, problem: "Changed line" },
    { file: "src/a.js", line: 4, problem: "Context line" },
    { location: "pull-request", problem: "Missing behavior" },
  ];

  const result = validateFindingLines(findings, diff, true);

  assert.deepEqual(result.accepted.map(({ problem }) => problem), ["Changed line", "Missing behavior"]);
  assert.equal(result.rejected[0].rejection, "Finding does not identify a changed final-state line.");
});

test("deduplicates one root cause and keeps its highest severity", () => {
  const result = dedupeFindings([
    { problem: "Symptom one", rootCause: "Unvalidated target ref", severity: "MINOR" },
    { problem: "Symptom two", rootCause: "Unvalidated target ref", severity: "MAJOR" },
    { problem: "Separate", rootCause: "Missing PBI", severity: "MAJOR" },
  ]);

  assert.deepEqual(result.map(({ problem }) => problem), ["Symptom two", "Separate"]);
});

test("renders Azure findings as one Markdown report", () => {
  const report = renderAzureReport(
    {
      headSha: "abc123",
      pullNumber: 7,
      repository: "api",
      targetRef: "refs/heads/main",
      workItem: { number: 41, title: "Review pull requests" },
    },
    [
      {
        correction: "Validate the ref before use.",
        file: "src/review.js",
        impact: "A wrong ref is reviewed.",
        line: 20,
        problem: "Target ref is trusted.",
        requirement: "AC 2",
        rootCause: "Unvalidated target ref",
        severity: "MAJOR",
      },
    ],
  );

  assert.ok(report.includes("ADO-7-1: MAJOR Target ref is trusted"));
  assert.ok(report.includes("`src/review.js:20`"));
  assert.ok(report.includes("Status: Open"));
});
