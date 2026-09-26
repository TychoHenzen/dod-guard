// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import { resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import { fileURLToPath } from "node:url";
// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import process from "node:process";

const PROJECT_NODE_ID = /^PVT_[A-Za-z0-9]+$/;
const PROJECT_ITEM_LIMIT = "1000";

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", windowsHide: true });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `gh exited with ${result.status}`;
    throw new Error(detail);
  }
  return result;
}

function requireText(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

function parseJson(result, operation) {
  if (result?.status !== 0) {
    throw new Error(`${operation} did not complete successfully.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${operation} returned invalid JSON.`, { cause: error });
  }
}

function resolveProjectNodeId(project) {
  const projectId = project?.id;
  if (!PROJECT_NODE_ID.test(projectId ?? "")) {
    throw new Error("Project view must return a global ProjectV2 node ID beginning with PVT_.");
  }
  return projectId;
}

function buildProjectViewCommand(owner, projectNumber) {
  return ["project", "view", String(projectNumber), "--owner", owner, "--format", "json"];
}

function buildProjectItemListCommand(owner, projectNumber) {
  return [
    "project",
    "item-list",
    String(projectNumber),
    "--owner",
    owner,
    "--format",
    "json",
    "--limit",
    PROJECT_ITEM_LIMIT,
  ];
}

function buildProjectItemEditCommand({ itemId, projectId, statusFieldId, statusOptionId }) {
  return [
    "project",
    "item-edit",
    "--id",
    itemId,
    "--project-id",
    projectId,
    "--field-id",
    statusFieldId,
    "--single-select-option-id",
    statusOptionId,
  ];
}

function readProjectItemStatus(item, itemId) {
  const { status: itemStatus } = item ?? {};
  let status;
  if (typeof itemStatus === "string") {
    status = itemStatus;
  } else {
    status = itemStatus?.name;
  }
  if (typeof status !== "string" || status.length === 0) {
    throw new Error(`Project item ${itemId} readback did not include a status.`);
  }
  return status;
}

function writeProjectStatuses({
  owner,
  projectNumber,
  statusFieldId,
  statusOptionId,
  expectedStatus,
  itemIds,
  commandRunner = runGh,
}) {
  requireText(owner, "owner");
  if (projectNumber === undefined || projectNumber === null || String(projectNumber).length === 0) {
    throw new Error("projectNumber must be a non-empty value.");
  }
  requireText(statusFieldId, "statusFieldId");
  requireText(statusOptionId, "statusOptionId");
  requireText(expectedStatus, "expectedStatus");
  if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.some((itemId) => typeof itemId !== "string" || itemId.length === 0)) {
    throw new Error("itemIds must contain at least one non-empty item ID.");
  }

  const project = parseJson(
    commandRunner(buildProjectViewCommand(owner, projectNumber)),
    "Project view",
  );
  const projectId = resolveProjectNodeId(project);
  const mutations = [];

  for (const itemId of itemIds) {
    commandRunner(
      buildProjectItemEditCommand({ itemId, projectId, statusFieldId, statusOptionId }),
    );
    const items = parseJson(
      commandRunner(buildProjectItemListCommand(owner, projectNumber)),
      "Project item readback",
    );
    if (!Array.isArray(items?.items)) {
      throw new Error("Project item readback must include an items array.");
    }
    const item = items.items.find((candidate) => candidate?.id === itemId);
    if (!item) {
      throw new Error(`Project item ${itemId} was missing from readback.`);
    }
    const status = readProjectItemStatus(item, itemId);
    if (status !== expectedStatus) {
      throw new Error(`Project item ${itemId} read back ${status}, expected ${expectedStatus}.`);
    }
    mutations.push({ itemId, status });
  }

  return { projectId, mutations };
}

function usage() {
  return "Usage: node project-status.mjs <owner> <project-number> <status-field-id> <status-option-id> <expected-status> <item-id>...";
}

let entrypoint = "";
if (process.argv[1]) {
  entrypoint = resolve(process.argv[1]);
}
const modulePath = resolve(fileURLToPath(import.meta.url));
if (entrypoint === modulePath) {
  const [owner, projectNumber, statusFieldId, statusOptionId, expectedStatus, ...itemIds] = process.argv.slice(2);
  const requiredArguments = [owner, projectNumber, statusFieldId, statusOptionId, expectedStatus];
  if (requiredArguments.some((argument) => !argument) || itemIds.length === 0) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(`${JSON.stringify(writeProjectStatuses({
        owner,
        projectNumber,
        statusFieldId,
        statusOptionId,
        expectedStatus,
        itemIds,
      }), null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`project-status failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

export {
  buildProjectItemEditCommand,
  buildProjectItemListCommand,
  buildProjectViewCommand,
  resolveProjectNodeId,
  writeProjectStatuses,
};
