// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import { resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import { fileURLToPath } from "node:url";
// biome-ignore lint/correctness/noNodejsModules: This shipped command invokes the local GitHub CLI.
import process from "node:process";

const PROJECT_NODE_ID = /^PVT_[A-Za-z0-9]+$/;
const PROJECT_PAGE_SIZE = 100;

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
  const projectId = project?.node_id ?? project?.id;
  if (!PROJECT_NODE_ID.test(projectId ?? "")) {
    throw new Error("Project view must return a global ProjectV2 node ID beginning with PVT_.");
  }
  return projectId;
}

function buildProjectViewCommand(owner, projectNumber) {
  return ["api", `users/${owner}/projectsV2/${projectNumber}`];
}

function buildProjectFieldsCommand(owner, projectNumber) {
  return [
    "api",
    "--paginate",
    "--slurp",
    `users/${owner}/projectsV2/${projectNumber}/fields?per_page=${PROJECT_PAGE_SIZE}`,
  ];
}

function buildProjectItemListCommand(owner, projectNumber, statusFieldId) {
  const fields = statusFieldId === undefined ? "" : `&fields=${statusFieldId}`;
  return [
    "api",
    "--paginate",
    "--slurp",
    `users/${owner}/projectsV2/${projectNumber}/items?per_page=${PROJECT_PAGE_SIZE}${fields}`,
  ];
}

function buildProjectItemEditCommand({ owner, projectNumber, itemId, statusFieldId, statusOptionId }) {
  return [
    "api",
    "--method",
    "PATCH",
    `users/${owner}/projectsV2/${projectNumber}/items/${itemId}`,
    "-F",
    `fields[][id]=${statusFieldId}`,
    "-f",
    `fields[][value]=${statusOptionId}`,
  ];
}

function parseArrayResponse(result, operation) {
  const data = parseJson(result, operation);
  if (!Array.isArray(data)) {
    throw new Error(`${operation} must return an array.`);
  }
  const pages = data.length === 0 || Array.isArray(data[0]) ? data : [data];
  if (pages.some((page) => !Array.isArray(page))) {
    throw new Error(`${operation} must return arrays of values.`);
  }
  return pages.flat();
}

function resolveStatusField(fields, statusFieldId) {
  const matches = fields.filter((field) =>
    String(field?.node_id ?? "") === statusFieldId || String(field?.id ?? "") === statusFieldId,
  );
  if (matches.length !== 1) {
    throw new Error(`Status field ${statusFieldId} must resolve to exactly one REST field.`);
  }
  const [field] = matches;
  if (field.data_type !== "single_select" || !Array.isArray(field.options)) {
    throw new Error(`Status field ${statusFieldId} must be a single-select field with options.`);
  }
  return field;
}

function resolveStatusOption(statusField, statusOptionId, expectedStatus) {
  const option = statusField.options.find((candidate) => String(candidate?.id ?? "") === statusOptionId);
  const names = [];
  if (typeof option?.name === "string") {
    names.push(option.name);
  } else if (option?.name && typeof option.name === "object") {
    for (const key of ["raw", "html"]) {
      if (key in option.name) names.push(option.name[key]);
    }
  }
  if (!option || names.length === 0 || names.some((name) => typeof name !== "string" || name.trim().length === 0) ||
      new Set(names).size !== 1 || names[0] !== expectedStatus) {
    throw new Error(`Status option ${statusOptionId} must map to ${expectedStatus}.`);
  }
  return option;
}

function findProjectItem(items, itemId) {
  const matches = items.filter((item) =>
    String(item?.node_id ?? "") === itemId || String(item?.id ?? "") === itemId,
  );
  if (matches.length !== 1) {
    return null;
  }
  return matches[0];
}

function projectItemIdentity(item) {
  const id = item?.id;
  const nodeId = item?.node_id ?? item?.nodeId;
  if (id === undefined || id === null || String(id).trim().length === 0 ||
      nodeId === undefined || nodeId === null || String(nodeId).trim().length === 0) {
    throw new Error("Project item readback must include stable numeric and global IDs.");
  }
  return { id: String(id), nodeId: String(nodeId) };
}

function validateProjectItems(items) {
  const seenIds = new Set();
  const seenNodeIds = new Set();
  const seenMembership = new Set();
  for (const item of items) {
    const { id, nodeId } = projectItemIdentity(item);
    if (seenIds.has(id) || seenNodeIds.has(nodeId)) {
      throw new Error(`Project item ${nodeId} appeared more than once in readback.`);
    }
    seenIds.add(id);
    seenNodeIds.add(nodeId);
    const repository = item?.content?.repository?.full_name ?? item?.content?.repository?.fullName;
    const number = item?.content?.number;
    if (repository && number !== undefined && number !== null) {
      const membership = `${repository.toLowerCase()}#${number}`;
      if (seenMembership.has(membership)) {
        throw new Error(`Project membership ${membership} appeared more than once in readback.`);
      }
      seenMembership.add(membership);
    }
  }
  return items;
}

function readProjectItemStatus(item, itemId, statusFieldId) {
  const statusFields = (Array.isArray(item?.fields) ? item.fields : []).filter((field) =>
    String(field?.id ?? "") === String(statusFieldId) || field?.name === "Status",
  );
  if (statusFields.length !== 1) {
    throw new Error(`Project item ${itemId} readback did not include exactly one Status field/value.`);
  }
  const value = statusFields[0].value;
  const names = [];
  if (typeof value === "string") {
    names.push(value);
  } else if (value?.name && typeof value.name === "object") {
    for (const key of ["raw", "html"]) {
      if (key in value.name) names.push(value.name[key]);
    }
  } else if (value && typeof value.name === "string") {
    names.push(value.name);
  }
  if (names.length === 0 || names.some((name) => typeof name !== "string" || name.trim().length === 0) ||
      new Set(names).size !== 1) {
    throw new Error(`Project item ${itemId} readback did not include one non-contradictory Status field/value.`);
  }
  return names[0];
}

function readProjectItems({ owner, projectNumber, statusFieldId, targetItemIds, commandRunner }) {
  const items = parseArrayResponse(
    commandRunner(buildProjectItemListCommand(owner, projectNumber, statusFieldId)),
    "Project item readback",
  );
  return { items: validateProjectItems(items) };
}

function runStatusMutation(commandRunner, command) {
  const result = commandRunner(command);
  if (result?.status !== undefined && result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `Project status mutation exited with ${result.status}.`);
  }
  return result;
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
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("itemIds must contain unique item IDs.");
  }

  const project = parseJson(
    commandRunner(buildProjectViewCommand(owner, projectNumber)),
    "Project view",
  );
  const projectId = resolveProjectNodeId(project);
  const statusField = resolveStatusField(
    parseArrayResponse(
      commandRunner(buildProjectFieldsCommand(owner, projectNumber)),
      "Project fields",
    ),
    statusFieldId,
  );
  resolveStatusOption(statusField, statusOptionId, expectedStatus);
  const restStatusFieldId = String(statusField.id);
  const initialItems = readProjectItems({
    owner,
    projectNumber,
    statusFieldId: restStatusFieldId,
    targetItemIds: itemIds,
    commandRunner,
  });
  const restItemIds = new Map();
  const initialStatuses = new Map();
  for (const itemId of itemIds) {
    const item = findProjectItem(initialItems.items, itemId);
    if (!item || item.id === undefined || item.id === null) {
      throw new Error(`Project item ${itemId} was missing from readback.`);
    }
    const identity = projectItemIdentity(item);
    if (identity.nodeId !== itemId) {
      throw new Error(`Project item ${itemId} readback must preserve the same numeric and global IDs.`);
    }
    restItemIds.set(itemId, identity.id);
    initialStatuses.set(itemId, readProjectItemStatus(item, itemId, restStatusFieldId));
  }
  const mutations = [];

  for (const itemId of itemIds) {
    if (initialStatuses.get(itemId) === expectedStatus) {
      mutations.push({ itemId, status: expectedStatus });
      continue;
    }

    let mutationError;
    try {
      runStatusMutation(
        commandRunner,
        buildProjectItemEditCommand({
          owner,
          projectNumber,
          itemId: restItemIds.get(itemId),
          statusFieldId: restStatusFieldId,
          statusOptionId,
        }),
      );
    } catch (error) {
      mutationError = error;
    }
    const items = readProjectItems({
      owner,
      projectNumber,
      statusFieldId: restStatusFieldId,
      targetItemIds: itemIds,
      commandRunner,
    });
    const item = findProjectItem(items.items, itemId);
    if (!item) {
      throw new Error(`Project item ${itemId} was missing from readback.`);
    }
    const identity = projectItemIdentity(item);
    if (identity.id !== restItemIds.get(itemId) || identity.nodeId !== itemId) {
      throw new Error(`Project item ${itemId} readback must preserve the same numeric and global IDs.`);
    }
    const status = readProjectItemStatus(item, itemId, restStatusFieldId);
    if (status !== expectedStatus) {
      if (mutationError) {
        throw new Error(
          `Project item ${itemId} status mutation failed (${mutationError.message}); read back ${status}, expected ${expectedStatus}.`,
          { cause: mutationError },
        );
      }
      throw new Error(`Project item ${itemId} read back ${status}, expected ${expectedStatus}.`);
    }
    mutations.push({ itemId, status });
  }

  return { projectId, mutations };
}

function usage() {
  return "Usage: node project-status.mjs <owner> <project-number> <status-field-node-id> <status-option-id> <expected-status> <item-id>...";
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
  buildProjectFieldsCommand,
  buildProjectItemListCommand,
  buildProjectViewCommand,
  resolveProjectNodeId,
  writeProjectStatuses,
};
