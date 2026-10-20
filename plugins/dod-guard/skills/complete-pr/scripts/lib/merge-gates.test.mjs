// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import {
  createFixtureLocalGit,
  FixtureClient,
  immediateOptions,
  passingChecks,
  pendingChecks,
  protectionEndpoint,
  pull,
  requiredCheckNames,
  restChecksReader,
} from "./complete-pr.test-support.mjs";
import { mergingPulls } from "./complete-pr-flows.test-support.mjs";
import { normalizePullRequest } from "./pull-requests.mjs";

test("waits for required checks, confirms merge, and deletes the trusted remote branch", async () => {
  const localGit = createFixtureLocalGit();
  const mergedState = normalizePullRequest({ state: "closed", merged_at: "2026-09-12T13:47:19Z" }, "owner/repo").state;
  const client = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: mergingPulls(mergedState),
  });

  const result = await completePullRequest(client, { ...immediateOptions, localGit });

  assert.equal(result.acceptedHead, "head-1");
  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(result.local, { branch: "deleted", currentCheckout: "switched_to_default" });
  assert.deepEqual(localGit.calls, [["codex/24-complete-pr", "master", { dryRun: false }]]);
  assert.deepEqual(
    client.calls.filter(([name]) => name === "markReady"),
    [["markReady", 24]],
  );
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
});

test("waits for all four repository required checks before trusted cleanup", async () => {
  const requiredChecks = requiredCheckNames.map((name) => ({ bucket: "pending", name, state: "IN_PROGRESS" }));
  const passingRequiredChecks = requiredCheckNames.map((name) => ({ bucket: "pass", name, state: "SUCCESS" }));
  const client = new FixtureClient({
    checks: [requiredChecks, passingRequiredChecks],
    pulls: mergingPulls("MERGED"),
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "deleteBranchRef"),
    [["deleteBranchRef", "codex/24-complete-pr"]],
  );
});

test("treats skipped required checks as passing", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "skipping", name: "build-test", state: "SKIPPED" }]],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
});

test("treats a skipped required check alongside passing checks as complete", async () => {
  const client = new FixtureClient({
    checks: [
      [
        { bucket: "skipping", name: "build-test", state: "SKIPPED" },
        { bucket: "pass", name: "plugin-config", state: "SUCCESS" },
        { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
        { bucket: "pass", name: "package-integrity", state: "SUCCESS" },
      ],
    ],
    pulls: [
      pull(),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
    ],
  });

  const result = await completePullRequest(client, immediateOptions);

  assert.equal(result.mergeCommitSha, "merge-1");
  assert.equal(result.branch, "deleted");
});

test("reports the reason for unsupported required-check evidence", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "PROVIDER_MISMATCH" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /PROVIDER_MISMATCH/,
  });
});

test("stops on missing required-check evidence without merge or branch cleanup", async () => {
  const client = new FixtureClient({
    checks: [[{ bucket: "unknown", name: "build-test", state: "MISSING" }]],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), {
    code: "unknown_check_state",
    message: /MISSING/,
  });
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "dispatch"),
    false,
  );
});

test("stops on an HTTP 403 branch-protection read naming the endpoint and sends no merge request", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    requiredChecksReader: restChecksReader({
      protection: { stderr: "gh: Resource not accessible by personal access token (HTTP 403)", status: 1, stdout: "" },
    }),
  });

  await assert.rejects(
    completePullRequest(client, immediateOptions),
    (error) => error.message.includes(protectionEndpoint) && error.message.includes("HTTP 403"),
  );
  assert.ok(client.calls.some(([name]) => name === "getRequiredChecks"));
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("stops with missing_required_checks on an unprotected base and sends no merge request", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    requiredChecksReader: restChecksReader({
      protection: { stderr: "gh: Not Found (HTTP 404)", status: 1, stdout: "" },
    }),
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "missing_required_checks" });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});

test("stops without merge or branch cleanup after required-check read failure", async () => {
  const localGit = createFixtureLocalGit();
  const failure = new Error("HTTP 500: transient provider failure");
  const client = new FixtureClient({
    requiredChecksError: failure,
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, { ...immediateOptions, localGit }), failure);
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
  assert.equal(localGit.calls.length, 0);
});

test("stops on failed or cancelled required checks", async () => {
  await Promise.all(
    ["fail", "cancel"].map(async (bucket) => {
      const client = new FixtureClient({
        checks: [[{ bucket, name: "static-analysis", state: bucket.toUpperCase() }]],
        pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
      });

      await assert.rejects(completePullRequest(client, immediateOptions), { code: "required_check_failed" });
    }),
  );
});

test("stops when the head changes outside a guarded base update", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ headSha: "unexpected", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unexpected_head_change" });
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});
