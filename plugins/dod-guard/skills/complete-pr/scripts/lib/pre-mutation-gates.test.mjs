// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { completePullRequest } from "./complete-pr.mjs";
import {
  createFixtureLocalGit,
  FixtureClient,
  immediateOptions,
  mutationCallNames,
  passingChecks,
  pendingChecks,
  pull,
  sequenceCases,
  unresolvedThread,
} from "./complete-pr.test-support.mjs";
import { CompletionError } from "./completion-error.mjs";

const closesRemedyPattern = /Add "Closes #<parent>"/;

const splitRemedyPattern = /split the undelivered scope/;

const discussionUrlPattern = /https:\/\/github\.com\/owner\/repo\/pull\/24#discussion_r1/;

const sourcePathPattern = /src\/a\.mjs/;

const draftAndReadyPullRequests = [
  ["draft", pull()],
  ["ready", pull({ isDraft: false })],
];

test("rejects a pull request whose base changes before required-check verification", async () => {
  const client = new FixtureClient({
    pulls: [pull(), pull({ baseBranch: "release", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "wrong_base_branch" });
  assert.equal(
    client.calls.some(([name]) => name === "enableRepositoryAutoMerge"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
  assert.equal(
    client.calls.some(([name]) => name === "deleteBranchRef"),
    false,
  );
});

for (const [label, pullRequest] of draftAndReadyPullRequests) {
  test(`stops a ${label} pull request with an unresolved review thread before any mutation`, async () => {
    const client = new FixtureClient({
      pulls: [pullRequest],
      reviewThreads: [[unresolvedThread()]],
      workflowRuns: [[]],
    });

    const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

    assert.equal(failure.code, "unresolved-review-threads");
    assert.match(failure.message, discussionUrlPattern);
    assert.match(failure.message, sourcePathPattern);
    assert.deepEqual(
      client.calls.filter(([name]) => mutationCallNames.includes(name)),
      [],
    );
  });
}

for (const [label, pullRequest] of draftAndReadyPullRequests) {
  test(`stops a ${label} pull request with no closing issue reference before any mutation`, async () => {
    const client = new FixtureClient({ pulls: [pullRequest], issues: [[]], workflowRuns: [[]] });

    const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

    assert.equal(failure.code, "missing_linked_issue");
    assert.match(failure.message, closesRemedyPattern);
    assert.match(failure.message, splitRemedyPattern);
    assert.deepEqual(
      client.calls.filter(([name]) => mutationCallNames.includes(name)),
      [],
    );
  });
}

const threadRerunTitle = [
  "a thread opened during the required-check wait stops before the merge,",
  "and a rerun after it is resolved merges once",
].join(" ");

test(threadRerunTitle, async () => {
  const mergedState = "MERGED";
  const firstRun = new FixtureClient({
    checks: [pendingChecks, passingChecks],
    pulls: [pull(), pull({ isDraft: false }), pull({ isDraft: false }), pull({ isDraft: false })],
    reviewThreads: [[], [unresolvedThread()]],
  });

  await assert.rejects(completePullRequest(firstRun, immediateOptions), { code: "unresolved-review-threads" });
  assert.equal(
    firstRun.calls.some(([name]) => name === "wait"),
    true,
  );
  assert.equal(
    firstRun.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );

  const rerun = new FixtureClient({
    pulls: [
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false }),
      pull({ isDraft: false, mergeCommitSha: "merge-1", state: mergedState }),
    ],
  });

  const result = await completePullRequest(rerun, { ...immediateOptions, localGit: createFixtureLocalGit() });

  assert.deepEqual(
    rerun.calls.filter(([name]) => name === "mergePullRequest"),
    [["mergePullRequest", 24, "head-1"]],
  );
  assert.equal(result.trustedHead, "head-1");
});

test("a review-threads-unavailable error from the reader stops before any mutation with its cause kept", async () => {
  const cause = new Error("GraphQL request timed out");
  const readerError = new CompletionError(
    "review-threads-unavailable",
    "Review threads for pull request #24 could not be read: GraphQL request timed out",
    { cause },
  );
  const client = new FixtureClient({
    pulls: [pull()],
    reviewThreads: [readerError],
    workflowRuns: [[]],
  });

  const failure = await completePullRequest(client, immediateOptions).catch((error) => error);

  assert.equal(failure, readerError);
  assert.equal(failure.code, "review-threads-unavailable");
  assert.equal(failure.cause, cause);
  assert.deepEqual(
    client.calls.filter(([name]) => mutationCallNames.includes(name)),
    [],
  );
});

for (const [code, { pullOverrides, repository }] of sequenceCases) {
  test(`completePullRequest stops with ${code} before any mutation`, async () => {
    const client = new FixtureClient({ pulls: [pull(pullOverrides)], repository });

    await assert.rejects(completePullRequest(client, immediateOptions), { code });
    assert.deepEqual(
      client.calls.filter(([name]) => mutationCallNames.includes(name)),
      [],
    );
  });
}

test("completePullRequest stops with not_open_pull_request before any mutation", async () => {
  const client = new FixtureClient({ pulls: [pull({ state: "CLOSED" })] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "not_open_pull_request" });
  assert.deepEqual(
    client.calls.filter(([name]) => mutationCallNames.includes(name)),
    [],
  );
});

test("a missing closing issue stops before the temporary refs are read", async () => {
  const client = new FixtureClient({ issues: [[]], pulls: [pull()] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "missing_linked_issue" });
  assert.equal(
    client.calls.some(([name]) => name === "getPullRequestRefs"),
    false,
  );
});

test("an unresolved thread stops before the ci.yml run is read", async () => {
  const client = new FixtureClient({ pulls: [pull()], reviewThreads: [[unresolvedThread()]] });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unresolved-review-threads" });
  assert.equal(
    client.calls.some(([name]) => name === "getCiWorkflowRuns"),
    false,
  );
});

test("a moved head with a changed base reports the head change first", async () => {
  const ready = pull({ isDraft: false });
  const client = new FixtureClient({
    pulls: [ready, ready, pull({ baseBranch: "release", headSha: "head-2", isDraft: false })],
  });

  await assert.rejects(completePullRequest(client, immediateOptions), { code: "unexpected_head_change" });
  assert.equal(
    client.calls.some(([name]) => name === "mergePullRequest"),
    false,
  );
});
