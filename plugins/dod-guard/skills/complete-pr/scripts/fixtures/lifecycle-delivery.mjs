import assert from "node:assert/strict";
import { runBoundary, runRest } from "./lifecycle-boundary.mjs";
import {
  assertIssueReadbacks,
  closeIssue,
  mergePullRequest,
  writeStatus,
} from "./lifecycle-steps.mjs";
import {
  HEAD_SHA,
  ISSUE_LABELS,
  ISSUE_NUMBERS,
  PULL_NUMBER,
  REPOSITORY,
} from "./lifecycle-constants.mjs";

export async function verifyDraftHandoff(ctx) {
  const pullRequest = await runBoundary(ctx, {
    operation: "draft-handoff-pull",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => ctx.client.getPullRequest(),
  });
  assert.equal(pullRequest.state, "OPEN");
  assert.equal(pullRequest.isDraft, false);
  assert.equal(pullRequest.headSha, HEAD_SHA);
  assert.equal(pullRequest.mergeable, "MERGEABLE");
  const checks = await runBoundary(ctx, {
    operation: "draft-handoff-checks",
    request: {
      repository: REPOSITORY,
      pullNumber: PULL_NUMBER,
      headSha: HEAD_SHA,
    },
    restEndpoint: `GET /repos/${REPOSITORY}/commits/${HEAD_SHA}/check-runs`,
    rest: () => ctx.client.getRequiredChecks(pullRequest),
  });
  assert.deepEqual(checks, [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
    { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
  ]);
  const reviews = await runBoundary(ctx, {
    operation: "draft-handoff-reviews",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}/reviews`,
    rest: () =>
      runRest(ctx.transport, [
        "api",
        `repos/${REPOSITORY}/pulls/${PULL_NUMBER}/reviews`,
      ]),
  });
  assert.deepEqual(
    reviews.map(({ state }) => state),
    ["APPROVED"],
  );
  const linkedIssues = await runBoundary(ctx, {
    operation: "draft-handoff-linked-issues",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => ctx.client.getLinkedIssues(PULL_NUMBER),
  });
  assert.deepEqual(
    linkedIssues.map(({ number, state }) => ({ number, state })),
    ISSUE_NUMBERS.map((number) => ({ number, state: "OPEN" })),
  );
}

export async function completeDelivery(ctx) {
  assert.deepEqual(await mergePullRequest(ctx), {
    merged: true,
    sha: "merge-1",
  });
  for (const number of ISSUE_NUMBERS) {
    await closeIssue(ctx, number);
  }
  await writeStatus(ctx, "Done");
  const completedPull = await runBoundary(ctx, {
    operation: "completion-pull-readback",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => ctx.client.getPullRequest(),
  });
  assert.equal(completedPull.state, "MERGED");
  const closedIssues = await runBoundary(ctx, {
    operation: "closure-linked-issues-readback",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/pulls/${PULL_NUMBER}`,
    rest: () => ctx.client.getLinkedIssues(PULL_NUMBER),
  });
  assert.deepEqual(
    closedIssues.map(({ number, state }) => ({ number, state })),
    ISSUE_NUMBERS.map((number) => ({ number, state: "CLOSED" })),
  );
  await assertIssueReadbacks(ctx, {
    labels: ISSUE_LABELS,
    state: "closed",
    phase: "closure",
  });
}
