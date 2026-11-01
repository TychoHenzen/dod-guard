// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { normalizeGitHubReviewThreads } from "./lib/fix-support.mjs";

test("selects a finding whose body ends with its visible GH id by that id", () => {
  const body = "**MAJOR** Fix the branch check\n\nGH-41";
  const payload = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [{ body, commit: { oid: "abc123" }, databaseId: 41, url: "https://example.test/41" }],
                },
                id: "PRRT_1",
                isOutdated: false,
                isResolved: false,
                line: 20,
                path: "src/review.js",
              },
            ],
          },
        },
      },
    },
  };
  const [finding] = normalizeGitHubReviewThreads(payload, ["GH-41"]);
  assert.equal(finding.id, "GH-41");
  assert.equal(finding.body, body);
  assert.equal(finding.body.endsWith(finding.id), true);
});
