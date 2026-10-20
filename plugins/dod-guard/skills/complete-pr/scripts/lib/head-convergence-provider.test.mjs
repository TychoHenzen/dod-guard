// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { FixtureClient, pull } from "./complete-pr.test-support.mjs";
import { convergeAt } from "./complete-pr-flows.test-support.mjs";

// Builds the pattern for an error message from its ordered fragments.
function inOrder(...fragments) {
  return new RegExp(fragments.join(".*"));
}

test("stops on a temporary-ref provider read failure", async () => {
  const client = new FixtureClient({ sourceRefs: [{ sha: "head-2" }] });
  const failure = new Error("HTTP 503: temporary ref read failed");
  client.getPullRequestRefs = () => {
    throw failure;
  };

  await assert.rejects(convergeAt(client, "head-2", 2), {
    code: "head_convergence_provider_error",
    message: inOrder(
      "temporary pull-request refs",
      "expected synchronized SHA head-2",
      "HTTP 503: temporary ref read failed",
      "source branch head-2",
      "PR API head head-2",
      "refs/pull/24/head <unread>",
    ),
  });
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("includes identities when a synthetic merge ref read fails", async () => {
  const client = new FixtureClient({
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }],
  });
  const failure = new Error("HTTP 503: synthetic merge ref read failed");
  client.getCommit = () => {
    throw failure;
  };

  await assert.rejects(convergeAt(client, "head-2", 1), {
    code: "head_convergence_provider_error",
    message: inOrder(
      "synthetic merge ref",
      "expected synchronized SHA head-2",
      "HTTP 503: synthetic merge ref read failed",
      "source branch head-2",
      "PR API head head-2",
      "refs/pull/24/head head-2",
    ),
  });
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});
