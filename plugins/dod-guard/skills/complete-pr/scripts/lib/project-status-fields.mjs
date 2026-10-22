import { hasNodeOrRestId } from "./project-item-identity.mjs";
import { statusValueName } from "./project-reads.mjs";

const PROJECT_NODE_ID = /^PVT_[A-Za-z0-9]+$/;

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

function projectNodeIdOf(project) {
  return project?.node_id ?? project?.id;
}

function resolveProjectNodeId(project) {
  const projectId = projectNodeIdOf(project);
  if (!PROJECT_NODE_ID.test(projectId ?? "")) {
    throw new Error("Project view must return a global ProjectV2 node ID beginning with PVT_.");
  }
  return projectId;
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
  const matches = fields.filter((field) => hasNodeOrRestId(field, statusFieldId));
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

export { nameOrNull, parseArrayResponse, parseJson, resolveProjectNodeId, resolveStatusField, resolveStatusOption };
