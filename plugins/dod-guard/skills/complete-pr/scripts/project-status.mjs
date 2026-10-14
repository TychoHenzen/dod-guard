// biome-ignore lint/correctness/noNodejsModules: This shipped command resolves its direct entrypoint.
import { resolve } from "node:path";
// biome-ignore lint/correctness/noNodejsModules: This shipped command exposes a direct CLI.
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This shipped command resolves its direct entrypoint.
import { fileURLToPath } from "node:url";
import { runTransport } from "../../../lib/transport-policy.mjs";
import { runGh } from "./lib/gh-runner.mjs";
import { isNotFoundResult, statusValueName } from "./lib/project-reads.mjs";

const PROJECT_NODE_ID = /^PVT_[A-Za-z0-9]+$/;
const NUMERIC_ITEM_ID = /^\d+$/;
const PROJECT_PAGE_SIZE = 100;
// The single-item endpoint can answer 404 for a moment after an item is added, so a 404 is read
// again. The attempt count is the bound; the delay only spaces the reads out.
// ASSUMPTION: 3 reads with 250 ms then 500 ms between them covers that lag (issue #869, C6).
const PROJECT_ITEM_READ_ATTEMPTS = 3;
const PROJECT_ITEM_RETRY_DELAY_MS = 250;
const GH_ACCEPTED_API_FAILURE = [0, 1];

// writeProjectStatuses is synchronous for closure apply and the CLI, so the wait between reads blocks.
function blockingSleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), 0, 0, milliseconds);
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

function buildProjectItemReadCommand(owner, projectNumber, itemId, statusFieldId) {
  return ["api", `users/${owner}/projectsV2/${projectNumber}/items/${itemId}?fields=${statusFieldId}`];
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
  const matches = fields.filter(
    (field) => String(field?.node_id ?? "") === statusFieldId || String(field?.id ?? "") === statusFieldId,
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

// Each caller keeps its own readback message, so a value the flattener rejects reads as no name.
function nameOrNull(value) {
  try {
    return statusValueName(value);
  } catch {
    return null;
  }
}

function resolveStatusOption(statusField, statusOptionId, expectedStatus) {
  const option = statusField.options.find((candidate) => String(candidate?.id ?? "") === statusOptionId);
  if (!option || nameOrNull(option) !== expectedStatus) {
    throw new Error(`Status option ${statusOptionId} must map to ${expectedStatus}.`);
  }
  return option;
}

function findProjectItem(items, itemId) {
  const matches = items.filter((item) => String(item?.node_id ?? "") === itemId || String(item?.id ?? "") === itemId);
  if (matches.length !== 1) {
    return null;
  }
  return matches[0];
}

function projectItemIdentity(item) {
  const id = item?.id;
  const nodeId = item?.node_id ?? item?.nodeId;
  if (
    id === undefined ||
    id === null ||
    String(id).trim().length === 0 ||
    nodeId === undefined ||
    nodeId === null ||
    String(nodeId).trim().length === 0
  ) {
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
  const statusFields = (Array.isArray(item?.fields) ? item.fields : []).filter(
    (field) => String(field?.id ?? "") === String(statusFieldId) || field?.name === "Status",
  );
  if (statusFields.length !== 1) {
    throw new Error(`Project item ${itemId} readback did not include exactly one Status field/value.`);
  }
  const name = nameOrNull(statusFields[0].value);
  if (name === null) {
    throw new Error(`Project item ${itemId} readback did not include one non-contradictory Status field/value.`);
  }
  return name;
}

function readProjectItems({ owner, projectNumber, statusFieldId, commandRunner }) {
  const items = parseArrayResponse(
    commandRunner(buildProjectItemListCommand(owner, projectNumber, statusFieldId)),
    "Project item readback",
  );
  return validateProjectItems(items);
}

function isNumericItemId(itemId) {
  return NUMERIC_ITEM_ID.test(itemId);
}

// A node id can only be found through the items list, which lags behind a newly added item, so the
// stop names the input that avoids the list.
function missingItemError(itemId) {
  if (isNumericItemId(itemId)) {
    return new Error(`Project item ${itemId} was missing from readback.`);
  }
  return new Error(
    `Project item ${itemId} was missing from readback. Pass its numeric item id instead; ` +
      "the items list can lag behind a newly added item.",
  );
}

// Returns null only when every bounded read answered 404; any other failure stops at once, because
// only a 404 is the known lag.
function readSingleProjectItem({ owner, projectNumber, statusFieldId, itemId, commandRunner, sleep }) {
  const command = buildProjectItemReadCommand(owner, projectNumber, itemId, statusFieldId);
  for (let attempt = 1; attempt <= PROJECT_ITEM_READ_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      sleep(PROJECT_ITEM_RETRY_DELAY_MS * (attempt - 1));
    }
    const result = commandRunner(command, GH_ACCEPTED_API_FAILURE);
    if (result?.status === 0) {
      const item = parseJson(result, "Project item readback");
      projectItemIdentity(item);
      return item;
    }
    if (!isNotFoundResult(result)) {
      throw new Error(
        result?.stderr?.trim() ||
          result?.stdout?.trim() ||
          `Project item ${itemId} read exited with ${result?.status}.`,
      );
    }
  }
  return null;
}

function runStatusMutation(commandRunner, command) {
  const result = commandRunner(command);
  if (result?.status !== undefined && result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || result.stdout?.trim() || `Project status mutation exited with ${result.status}.`,
    );
  }
  return result;
}

// Two inputs that name one item would PATCH it twice and report it twice, so refuse before any write.
function resolveProjectItemInputs(itemIds, statusFieldId, readTarget) {
  const resolved = new Map();
  const inputByNodeId = new Map();
  for (const itemId of itemIds) {
    const item = readTarget(itemId);
    if (!item) {
      throw missingItemError(itemId);
    }
    const identity = projectItemIdentity(item);
    const firstInput = inputByNodeId.get(identity.nodeId);
    if (firstInput !== undefined) {
      throw new Error(`Project item ${firstInput} and ${itemId} resolve to the same Project item ${identity.nodeId}.`);
    }
    inputByNodeId.set(identity.nodeId, itemId);
    resolved.set(itemId, { identity, status: readProjectItemStatus(item, itemId, statusFieldId) });
  }
  return resolved;
}

// Matching on the resolved pair, not the caller's spelling, reports a change to either ID alone as an
// identity change; when both IDs change nothing matches, so the readback stops as a missing item.
function findReadbackProjectItem(items, itemId, identity) {
  const matches = items.filter((candidate) => {
    const { id, nodeId } = projectItemIdentity(candidate);
    return id === identity.id || nodeId === identity.nodeId;
  });
  if (matches.length === 0) {
    throw new Error(`Project item ${itemId} was missing from readback.`);
  }
  const [item] = matches;
  const readback = projectItemIdentity(item);
  if (matches.length !== 1 || readback.id !== identity.id || readback.nodeId !== identity.nodeId) {
    throw new Error(`Project item ${itemId} readback must preserve the same numeric and global IDs.`);
  }
  return item;
}

// A numeric input is read through the single-item endpoint, which sees a new item before the list
// does. A node id can only be found in the list, and one list page can reach megabytes, so a run with
// numeric inputs alone never reads it.
function projectItemReads({ itemIds, sleep, ...listRead }) {
  const readSingle = (itemId) => readSingleProjectItem({ ...listRead, itemId, sleep });
  let listItems = [];
  if (!itemIds.every(isNumericItemId)) {
    listItems = readProjectItems(listRead);
  }
  return {
    resolveTarget(itemId) {
      if (!isNumericItemId(itemId)) {
        return findProjectItem(listItems, itemId);
      }
      const item = readSingle(itemId);
      if (item === null) {
        return null;
      }
      return findProjectItem([item], itemId);
    },
    readBack(itemId, identity) {
      if (!isNumericItemId(itemId)) {
        return findReadbackProjectItem(readProjectItems(listRead), itemId, identity);
      }
      const item = readSingle(identity.id);
      if (item === null) {
        throw missingItemError(itemId);
      }
      return findReadbackProjectItem([item], itemId, identity);
    },
  };
}

function writeProjectStatuses({
  owner,
  projectNumber,
  statusFieldId,
  statusOptionId,
  expectedStatus,
  itemIds,
  commandRunner = runGh,
  sleep = blockingSleep,
}) {
  requireText(owner, "owner");
  if (projectNumber === undefined || projectNumber === null || String(projectNumber).length === 0) {
    throw new Error("projectNumber must be a non-empty value.");
  }
  requireText(statusFieldId, "statusFieldId");
  requireText(statusOptionId, "statusOptionId");
  requireText(expectedStatus, "expectedStatus");
  if (
    !Array.isArray(itemIds) ||
    itemIds.length === 0 ||
    itemIds.some((itemId) => typeof itemId !== "string" || itemId.length === 0)
  ) {
    throw new Error("itemIds must contain at least one non-empty item ID.");
  }
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error("itemIds must contain unique item IDs.");
  }

  const project = parseJson(commandRunner(buildProjectViewCommand(owner, projectNumber)), "Project view");
  const projectId = resolveProjectNodeId(project);
  const statusField = resolveStatusField(
    parseArrayResponse(commandRunner(buildProjectFieldsCommand(owner, projectNumber)), "Project fields"),
    statusFieldId,
  );
  resolveStatusOption(statusField, statusOptionId, expectedStatus);
  const restStatusFieldId = String(statusField.id);
  const reads = projectItemReads({
    owner,
    projectNumber,
    statusFieldId: restStatusFieldId,
    commandRunner,
    sleep,
    itemIds,
  });
  const resolvedItems = resolveProjectItemInputs(itemIds, restStatusFieldId, reads.resolveTarget);
  const mutations = [];

  for (const itemId of itemIds) {
    const { identity, status: initialStatus } = resolvedItems.get(itemId);
    if (initialStatus === expectedStatus) {
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
          itemId: identity.id,
          statusFieldId: restStatusFieldId,
          statusOptionId,
        }),
      );
    } catch (error) {
      mutationError = error;
    }
    const item = reads.readBack(itemId, identity);
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

async function writeProjectStatusesWithFallback({ primaryMutation, evidence = [], ...options }) {
  const request = {
    owner: options.owner,
    projectNumber: options.projectNumber,
    statusFieldId: options.statusFieldId,
    statusOptionId: options.statusOptionId,
    expectedStatus: options.expectedStatus,
    itemIds: options.itemIds,
  };
  return runTransport({
    operation: "projectStatusWrite",
    request,
    primary: primaryMutation,
    rest: () => writeProjectStatuses(options),
    restEndpoint: `PATCH /users/${options.owner}/projectsV2/${options.projectNumber}/items/{itemId}`,
    mutation: true,
    readback: options.readback,
    evidence,
  });
}

function usage() {
  return [
    "Usage: node project-status.mjs <owner> <project-number> <status-field-node-id> <status-option-id> " +
      "<expected-status> <item-id>...",
    "  <item-id> is a Project item's numeric REST id or its PVTI_ global node id.",
  ].join("\n");
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
      process.stdout.write(
        `${JSON.stringify(
          writeProjectStatuses({
            owner,
            projectNumber,
            statusFieldId,
            statusOptionId,
            expectedStatus,
            itemIds,
          }),
          null,
          2,
        )}\n`,
      );
    } catch (error) {
      process.stderr.write(`project-status failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

export {
  buildProjectFieldsCommand,
  buildProjectItemEditCommand,
  buildProjectItemListCommand,
  buildProjectItemReadCommand,
  buildProjectViewCommand,
  PROJECT_ITEM_READ_ATTEMPTS,
  PROJECT_ITEM_RETRY_DELAY_MS,
  resolveProjectNodeId,
  writeProjectStatuses,
  writeProjectStatusesWithFallback,
};
