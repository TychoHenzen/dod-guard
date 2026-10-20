// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { FixtureClient, pull, sequenceCases } from "./complete-pr.test-support.mjs";
import { convergeAt } from "./complete-pr-flows.test-support.mjs";
import { waitForHeadConvergence } from "./head-convergence.mjs";

test("waits for stale PR and temporary head refs to converge", async () => {
  const client = new FixtureClient({
    pulls: [pull({ headSha: "head-2", isDraft: false })],
    pullRefs: [
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }],
      [{ kind: "head", ref: "refs/pull/24/head", sha: "head-2" }],
    ],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await convergeAt(client, "head-1", 2);

  assert.equal(result.headSha, "head-2");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "wait"),
    [["wait"]],
  );
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("stops after bounded stale-head convergence without writes", async () => {
  const client = new FixtureClient({
    pulls: [pull({ headSha: "head-1", isDraft: false }), pull({ headSha: "head-1", isDraft: false })],
    pullRefs: [[{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(convergeAt(client, "head-1", 2), {
    code: "head_convergence_timeout",
    message: /head-2.*head-1/,
  });
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

test("stops when the source branch moves during convergence", async () => {
  const client = new FixtureClient({
    pullRefs: [[{ kind: "head", ref: "refs/pull/24/head", sha: "head-1" }]],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-3" }],
  });

  await assert.rejects(convergeAt(client, "head-1", 2), { code: "head_branch_changed", message: /head-2.*head-3/ });
});

test("rejects a generated merge ref that omits the synchronized source parent", async () => {
  const client = new FixtureClient({
    commits: { "merge-ref": { parents: ["base-1", "other-head"], sha: "merge-ref" } },
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(convergeAt(client, "head-2", 1), { code: "head_merge_ref_mismatch", message: /head-2/ });
});

test("retries a stale generated merge ref until the synchronized source parent appears", async () => {
  const client = new FixtureClient({
    commits: {
      "merge-old": { parents: ["base-1", "head-1"], sha: "merge-old" },
      "merge-new": { parents: ["base-1", "head-2"], sha: "merge-new" },
    },
    pulls: [pull({ headSha: "head-2", isDraft: false })],
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-1" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-old" },
      ],
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-new" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }, { sha: "head-2" }],
  });

  const result = await convergeAt(client, "head-1", 2);

  assert.equal(result.headSha, "head-2");
  assert.deepEqual(
    client.calls.filter(([name]) => name === "wait"),
    [["wait"]],
  );
});

test("stops on missing temporary head evidence", async () => {
  const client = new FixtureClient({
    pullRefs: [[]],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(convergeAt(client, "head-1", 1), { code: "head_convergence_timeout", message: /<missing>/ });
  assert.equal(
    client.calls.some(([name]) => ["dispatch", "mergePullRequest", "deleteBranchRef"].includes(name)),
    false,
  );
});

for (const [code, { pullOverrides, repository }] of sequenceCases) {
  test(`waitForHeadConvergence of a merged pull request stops with ${code}`, async () => {
    const client = new FixtureClient({ repository });

    await assert.rejects(
      waitForHeadConvergence(client, {
        allowMerged: true,
        initialPullRequest: pull({ isDraft: false, mergeCommitSha: "merge-1", state: "MERGED", ...pullOverrides }),
        options: { headPollLimit: 1, pollMs: 0 },
        repository: client.repositoryDetails,
      }),
      { code },
    );
  });
}

test("waitForHeadConvergence stops with head_branch_not_found when the source branch is gone", async () => {
  const client = new FixtureClient({ sourceRefs: [null] });

  await assert.rejects(
    waitForHeadConvergence(client, {
      expectedHead: "head-1",
      initialPullRequest: pull({ isDraft: false }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_branch_not_found", message: /codex\/24-complete-pr/ },
  );
});

test("waitForHeadConvergence stops at once on a wrong merge-ref parent when identities already converged", async () => {
  const client = new FixtureClient({
    commits: { "merge-ref": { parents: ["base-1", "other-head"], sha: "merge-ref" } },
    pullRefs: [
      [
        { kind: "head", ref: "refs/pull/24/head", sha: "head-2" },
        { kind: "merge", ref: "refs/pull/24/merge", sha: "merge-ref" },
      ],
    ],
    sourceRefs: [{ sha: "head-2" }],
  });

  await assert.rejects(convergeAt(client, "head-2", 2), { code: "head_merge_ref_mismatch" });
  assert.equal(
    client.calls.some(([name]) => name === "wait"),
    false,
  );
});

test("waitForHeadConvergence stops with head_branch_changed before the temporary refs are read", async () => {
  const client = new FixtureClient({ sourceRefs: [{ sha: "head-3" }] });

  await assert.rejects(convergeAt(client, "head-2", 1), {
    code: "head_branch_changed",
    message: /moved from head-2 to head-3/,
  });
  assert.equal(
    client.calls.some(([name]) => name === "getPullRequestRefs"),
    false,
  );
});

test("waitForHeadConvergence stops with head_branch_changed for a merged head and a missing branch", async () => {
  const client = new FixtureClient({ sourceRefs: [null] });

  await assert.rejects(
    waitForHeadConvergence(client, {
      allowMerged: true,
      expectedHead: "head-2",
      initialPullRequest: pull({ headSha: "head-3", isDraft: false, mergeCommitSha: "merge-1", state: "MERGED" }),
      options: { headPollLimit: 1, pollMs: 0 },
      repository: client.repositoryDetails,
    }),
    { code: "head_branch_changed", message: /moved from head-2 to head-3/ },
  );
  assert.equal(
    client.calls.some(([name]) => name === "getPullRequestRefs"),
    false,
  );
});
