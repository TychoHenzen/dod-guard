import { projectItemIdentity } from "./project-item-identity.mjs";
import { readProjectItemStatus } from "./project-item-reads.mjs";
import { missingItemError } from "./project-item-single-read.mjs";

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

// Sends one edit and always reads the item back, because a failed edit can still have landed.
function applyStatusMutation({ commandRunner, reads, editCommand, itemId, identity, statusFieldId, expectedStatus }) {
  let mutationError;
  try {
    runStatusMutation(commandRunner, editCommand);
  } catch (error) {
    mutationError = error;
  }
  const item = reads.readBack(itemId, identity);
  const status = readProjectItemStatus(item, itemId, statusFieldId);
  if (status === expectedStatus) {
    return status;
  }
  if (mutationError) {
    const failed = `status mutation failed (${mutationError.message})`;
    throw new Error(`Project item ${itemId} ${failed}; read back ${status}, expected ${expectedStatus}.`, {
      cause: mutationError,
    });
  }
  throw new Error(`Project item ${itemId} read back ${status}, expected ${expectedStatus}.`);
}

export { applyStatusMutation, resolveProjectItemInputs };
