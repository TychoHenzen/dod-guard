import assert from "node:assert/strict";
import {
  writeProjectStatuses,
  writeProjectStatusesWithFallback,
} from "../project-status.mjs";
import { runBoundary, runRest } from "./lifecycle-boundary.mjs";
import {
  HEAD_SHA,
  ISSUE_NUMBERS,
  ITEM_NODE_IDS,
  OWNER,
  PROJECT_NODE_ID,
  PROJECT_NUMBER,
  PULL_NUMBER,
  REPOSITORY,
  STATUS_FIELD_NODE_ID,
  STATUS_OPTIONS,
} from "./lifecycle-constants.mjs";

export async function assertIssueReadbacks(
  context,
  { labels, state = "open", phase = "issue" },
) {
  for (const number of ISSUE_NUMBERS) {
    const issue = await runBoundary(context, {
      operation: `${phase}-read-${number}`,
      request: { repository: REPOSITORY, issueNumber: number },
      restEndpoint: `GET /repos/${REPOSITORY}/issues/${number}`,
      rest: () =>
        runRest(context.transport, [
          "api",
          `repos/${REPOSITORY}/issues/${number}`,
        ]),
    });
    assert.equal(issue.repository.full_name, REPOSITORY);
    assert.deepEqual(
      issue.labels.map(({ name }) => name),
      labels.get(number),
    );
    assert.equal(issue.state, state);
  }
}

export async function assertStatuses(context, expectedStatus, phase) {
  for (const number of ISSUE_NUMBERS) {
    const statuses = await runBoundary(context, {
      operation: `${phase}-status-read-${number}`,
      request: { repository: REPOSITORY, issueNumber: number },
      restEndpoint: `GET /users/${OWNER}/projectsV2/${PROJECT_NUMBER}/items`,
      rest: () => context.client.getIssueProjectStatuses(number),
    });
    assert.deepEqual(statuses, [expectedStatus]);
  }
}

function applyStatusWrite(context, writeOptions, operation) {
  if (!context.mcpRateLimited) return writeProjectStatuses(writeOptions);
  return writeProjectStatusesWithFallback({
    ...writeOptions,
    evidence: context.transportFailures,
    primaryMutation: async () => {
      context.mcpCalls.push(operation);
      throw Object.assign(new Error("API rate limit exceeded"), {
        status: 429,
        transport: "mcp",
      });
    },
  });
}

export async function writeStatus(context, expectedStatus) {
  const option = STATUS_OPTIONS.find(
    (candidate) => candidate.name === expectedStatus,
  );
  const writeOptions = {
    owner: OWNER,
    projectNumber: PROJECT_NUMBER,
    statusFieldId: STATUS_FIELD_NODE_ID,
    statusOptionId: option.id,
    expectedStatus,
    itemIds: ITEM_NODE_IDS,
    commandRunner: context.transport.commandRunner,
  };
  const slug = expectedStatus.toLowerCase().replaceAll(" ", "-");
  const operation = `status-write-${slug}`;
  const raw = await applyStatusWrite(context, writeOptions, operation);
  if (context.mcpRateLimited) context.restCalls.push(operation);
  assert.deepEqual(context.mcpRateLimited ? raw.value : raw, {
    projectId: PROJECT_NODE_ID,
    mutations: ITEM_NODE_IDS.map((itemId) => ({
      itemId,
      status: expectedStatus,
    })),
  });
  await assertStatuses(context, expectedStatus, slug);
}

export async function linkHierarchy(context, parentNumber, child) {
  await runBoundary(context, {
    operation: `hierarchy-link-${child.number}`,
    request: {
      repository: REPOSITORY,
      parentNumber,
      childNumber: child.number,
      childId: child.id,
    },
    restEndpoint: `POST /repos/${REPOSITORY}/issues/${parentNumber}/sub_issues`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${parentNumber}/sub_issues`;
      const existing = runRest(context.transport, ["api", endpoint]);
      if (!existing.some(({ number }) => number === child.number)) {
        runRest(context.transport, [
          "api",
          "--method",
          "POST",
          endpoint,
          "-F",
          `sub_issue_id=${child.id}`,
        ]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      if (!readback.some(({ number }) => number === child.number)) {
        throw new Error(
          `Hierarchy link for issue ${child.number} was unresolved.`,
        );
      }
      return readback;
    },
  });
}

export async function writeIssueLabels(context, number, labels) {
  await runBoundary(context, {
    operation: `refinement-labels-${number}`,
    request: { repository: REPOSITORY, issueNumber: number, labels },
    restEndpoint: `PATCH /repos/${REPOSITORY}/issues/${number}`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${number}`;
      const existing = runRest(context.transport, ["api", endpoint]);
      const current = existing.labels.map(({ name }) => name);
      if (JSON.stringify(current) !== JSON.stringify(labels)) {
        runRest(context.transport, [
          "api",
          "--method",
          "PATCH",
          endpoint,
          ...labels.flatMap((label) => ["-f", `labels[]=${label}`]),
        ]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      assert.deepEqual(
        readback.labels.map(({ name }) => name),
        labels,
      );
      return readback;
    },
  });
}

export async function closeIssue(context, number) {
  await runBoundary(context, {
    operation: `closure-${number}`,
    request: { repository: REPOSITORY, issueNumber: number, state: "closed" },
    restEndpoint: `PATCH /repos/${REPOSITORY}/issues/${number}`,
    rest: () => {
      const endpoint = `repos/${REPOSITORY}/issues/${number}`;
      const existing = runRest(context.transport, ["api", endpoint]);
      if (existing.state !== "closed") {
        runRest(context.transport, [
          "api",
          "--method",
          "PATCH",
          endpoint,
          "-f",
          "state=closed",
        ]);
      }
      const readback = runRest(context.transport, ["api", endpoint]);
      if (readback.state !== "closed") {
        throw new Error(`Issue ${number} closure was unresolved.`);
      }
      return readback;
    },
  });
}

export async function mergePullRequest(context) {
  return runBoundary(context, {
    operation: "completion-merge",
    request: {
      repository: REPOSITORY,
      pullNumber: PULL_NUMBER,
      headSha: HEAD_SHA,
    },
    restEndpoint: `PUT /repos/${REPOSITORY}/pulls/${PULL_NUMBER}/merge`,
    rest: () => {
      const existing = context.client.getPullRequest();
      if (existing.state === "MERGED") {
        return { merged: true, sha: existing.mergeCommitSha };
      }
      const result = context.client.mergePullRequest(PULL_NUMBER, HEAD_SHA);
      const readback = context.client.getPullRequest();
      if (readback.state !== "MERGED") {
        throw new Error(
          `Pull request ${PULL_NUMBER} merge was unresolved.`,
        );
      }
      return result;
    },
  });
}
