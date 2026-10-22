import assert from "node:assert/strict";
import {
  writeProjectStatuses,
  writeProjectStatusesWithFallback,
} from "../project-status.mjs";
import { runBoundary } from "./lifecycle-boundary.mjs";
import {
  ISSUE_NUMBERS,
  ITEM_NODE_IDS,
  OWNER,
  PROJECT_NODE_ID,
  PROJECT_NUMBER,
  REPOSITORY,
  STATUS_FIELD_NODE_ID,
  STATUS_OPTIONS,
} from "./lifecycle-constants.mjs";

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

function writeOptionsFor(context, expectedStatus) {
  const option = STATUS_OPTIONS.find(
    (candidate) => candidate.name === expectedStatus,
  );
  return {
    owner: OWNER,
    projectNumber: PROJECT_NUMBER,
    statusFieldId: STATUS_FIELD_NODE_ID,
    statusOptionId: option.id,
    expectedStatus,
    itemIds: ITEM_NODE_IDS,
    commandRunner: context.transport.commandRunner,
  };
}

function expectedWrite(expectedStatus, changed) {
  return {
    projectId: PROJECT_NODE_ID,
    mutations: ITEM_NODE_IDS.map((itemId) => ({
      itemId,
      status: expectedStatus,
      changed,
    })),
  };
}

export async function writeStatus(context, expectedStatus) {
  const slug = expectedStatus.toLowerCase().replaceAll(" ", "-");
  const operation = `status-write-${slug}`;
  // ASSUMPTION: every lifecycle run starts with each item at Backlog;
  // captureBaseline asserts that before its first write.
  const changed = (context.projectStatus ?? "Backlog") !== expectedStatus;
  const writeOptions = writeOptionsFor(context, expectedStatus);
  const raw = await applyStatusWrite(context, writeOptions, operation);
  if (context.mcpRateLimited) context.restCalls.push(operation);
  assert.deepEqual(
    context.mcpRateLimited ? raw.value : raw,
    expectedWrite(expectedStatus, changed),
  );
  context.projectStatus = expectedStatus;
  await assertStatuses(context, expectedStatus, slug);
}
