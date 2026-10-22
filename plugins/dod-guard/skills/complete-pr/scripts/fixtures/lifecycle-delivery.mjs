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

const PULL_PATH = `/repos/${REPOSITORY}/pulls/${PULL_NUMBER}`;

function readPull(ctx, operation, rest) {
  return runBoundary(ctx, {
    operation,
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET ${PULL_PATH}`,
    rest,
  });
}

function readChecks(ctx, pullRequest) {
  return runBoundary(ctx, {
    operation: "draft-handoff-checks",
    request: {
      repository: REPOSITORY,
      pullNumber: PULL_NUMBER,
      headSha: HEAD_SHA,
    },
    restEndpoint: `GET /repos/${REPOSITORY}/commits/${HEAD_SHA}/check-runs`,
    rest: () => ctx.client.getRequiredChecks(pullRequest),
  });
}

function readReviews(ctx) {
  return runBoundary(ctx, {
    operation: "draft-handoff-reviews",
    request: { repository: REPOSITORY, pullNumber: PULL_NUMBER },
    restEndpoint: `GET ${PULL_PATH}/reviews`,
    rest: () =>
      runRest(ctx.transport, [
        "api",
        `repos/${REPOSITORY}/pulls/${PULL_NUMBER}/reviews`,
      ]),
  });
}

function linkedIssueStates(issues) {
  return issues.map(({ number, state }) => ({ number, state }));
}

export async function verifyDraftHandoff(ctx) {
  const pullRequest = await readPull(ctx, "draft-handoff-pull", () =>
    ctx.client.getPullRequest(),
  );
  assert.equal(pullRequest.state, "OPEN");
  assert.equal(pullRequest.isDraft, false);
  assert.equal(pullRequest.headSha, HEAD_SHA);
  assert.equal(pullRequest.mergeable, "MERGEABLE");
  assert.deepEqual(await readChecks(ctx, pullRequest), [
    { bucket: "pass", name: "build-test", state: "SUCCESS" },
    { bucket: "pass", name: "static-analysis", state: "SUCCESS" },
  ]);
  const reviews = await readReviews(ctx);
  assert.deepEqual(
    reviews.map(({ state }) => state),
    ["APPROVED"],
  );
  const linkedIssues = await readPull(ctx, "draft-handoff-linked-issues", () =>
    ctx.client.getLinkedIssues(PULL_NUMBER),
  );
  assert.deepEqual(
    linkedIssueStates(linkedIssues),
    ISSUE_NUMBERS.map((number) => ({ number, state: "OPEN" })),
  );
}

async function assertDeliveryReadbacks(ctx) {
  const completedPull = await readPull(ctx, "completion-pull-readback", () =>
    ctx.client.getPullRequest(),
  );
  assert.equal(completedPull.state, "MERGED");
  const closedIssues = await readPull(
    ctx,
    "closure-linked-issues-readback",
    () => ctx.client.getLinkedIssues(PULL_NUMBER),
  );
  assert.deepEqual(
    linkedIssueStates(closedIssues),
    ISSUE_NUMBERS.map((number) => ({ number, state: "CLOSED" })),
  );
  await assertIssueReadbacks(ctx, {
    labels: ISSUE_LABELS,
    state: "closed",
    phase: "closure",
  });
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
  await assertDeliveryReadbacks(ctx);
}
