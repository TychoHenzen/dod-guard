import assert from "node:assert/strict";
import { GitHubClient } from "../lib/github-client.mjs";
import { createRecordingTransport } from "../lifecycle-fixture.mjs";
import {
  createIssueWithGuard,
  ensureProjectMembership,
  isRoutineGraphql,
  readProjectMembership,
  runBoundary,
  runRest,
} from "./lifecycle-boundary.mjs";
import {
  completeDelivery,
  verifyDraftHandoff,
} from "./lifecycle-delivery.mjs";
import { assertStatuses, writeStatus } from "./lifecycle-status.mjs";
import {
  assertIssueReadbacks,
  linkHierarchy,
  writeIssueLabels,
} from "./lifecycle-steps.mjs";
import {
  CHILD_NUMBERS,
  ISSUE_LABELS,
  ISSUE_NUMBERS,
  OWNER,
  PARENT_NUMBER,
  PROJECT_NUMBER,
  PULL_NUMBER,
  REPOSITORY,
} from "./lifecycle-constants.mjs";

export async function captureRepository(ctx) {
  const repository = await runBoundary(ctx, {
    operation: "capture-repository",
    request: { repository: REPOSITORY },
    restEndpoint: `GET /repos/${REPOSITORY}`,
    rest: () => ctx.client.getRepository(),
  });
  assert.deepEqual(repository, {
    autoMergeAllowed: true,
    canPush: true,
    defaultBranch: "master",
    nameWithOwner: REPOSITORY,
  });
}

export async function createIssues(ctx) {
  const createdIssues = [];
  for (const number of ISSUE_NUMBERS) {
    createdIssues.push(await createIssueWithGuard(ctx, number));
  }
  assert.deepEqual(
    createdIssues.map(({ number }) => number),
    ISSUE_NUMBERS,
  );
  return createdIssues;
}

export async function linkChildren(ctx, createdIssues) {
  for (const childNumber of CHILD_NUMBERS) {
    const child = createdIssues.find(({ number }) => number === childNumber);
    await linkHierarchy(ctx, PARENT_NUMBER, child);
  }
  const hierarchy = await runBoundary(ctx, {
    operation: "hierarchy-read",
    request: { repository: REPOSITORY, parentNumber: PARENT_NUMBER },
    restEndpoint: `GET /repos/${REPOSITORY}/issues/${PARENT_NUMBER}/sub_issues`,
    rest: () =>
      runRest(ctx.transport, [
        "api",
        `repos/${REPOSITORY}/issues/${PARENT_NUMBER}/sub_issues`,
      ]),
  });
  assert.deepEqual(
    hierarchy.map(({ number }) => number),
    CHILD_NUMBERS,
  );
}

export async function joinProject(ctx, createdIssues) {
  for (const issue of createdIssues) {
    await ensureProjectMembership(ctx, issue);
  }
  const projectMembership = (
    await runBoundary(ctx, {
      operation: "membership-read",
      request: { owner: OWNER, projectNumber: PROJECT_NUMBER },
      restEndpoint: `GET /users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
      rest: () => readProjectMembership(ctx.transport),
    })
  )
    .map(({ content }) => content.number)
    .sort((a, b) => a - b);
  assert.equal(
    projectMembership.length,
    ISSUE_NUMBERS.length,
    "Project membership readback was incomplete.",
  );
  assert.deepEqual(
    projectMembership,
    ISSUE_NUMBERS.slice().sort((a, b) => a - b),
  );
}

export async function captureBaseline(ctx, options) {
  await assertIssueReadbacks(ctx, {
    labels: new Map(ISSUE_NUMBERS.map((number) => [number, []])),
    state: "open",
    phase: "capture",
  });
  await assertStatuses(ctx, "Backlog", "capture");
  if (options.alreadyAppliedStatus)
    await writeStatus(ctx, options.alreadyAppliedStatus);
}

export async function refineIssues(ctx) {
  for (const number of ISSUE_NUMBERS) {
    await writeIssueLabels(ctx, number, ISSUE_LABELS.get(number));
  }
  await assertIssueReadbacks(ctx, {
    labels: ISSUE_LABELS,
    state: "open",
    phase: "refinement",
  });
  await writeStatus(ctx, "Todo");
  await writeStatus(ctx, "In Progress");
}

export async function runDisposableLifecycle(options = {}) {
  const transport = createRecordingTransport(options);
  const client = new GitHubClient(
    REPOSITORY,
    PULL_NUMBER,
    transport.commandRunner,
  );
  const ctx = {
    ...options,
    transport,
    client,
    mcpCalls: [],
    restCalls: [],
    transportFailures: [],
  };
  await captureRepository(ctx);
  const createdIssues = await createIssues(ctx);
  await linkChildren(ctx, createdIssues);
  await joinProject(ctx, createdIssues);
  await captureBaseline(ctx, options);
  await refineIssues(ctx);
  await verifyDraftHandoff(ctx);
  await completeDelivery(ctx);
  assert.equal(transport.calls.some(isRoutineGraphql), false);
  return { ...transport, ...ctx };
}
