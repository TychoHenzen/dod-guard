import { isNumericItemId, projectItemIdentity } from "./project-item-identity.mjs";
import { isNotFoundResult } from "./project-reads.mjs";
import { buildProjectItemReadCommand } from "./project-status-commands.mjs";
import { parseJson } from "./project-status-fields.mjs";

// The single-item endpoint can answer 404 for a moment after an item is added,
// so a 404 is read again. The attempt count is the bound; the delay only spaces
// the reads out.
// ASSUMPTION: 3 reads with 250 ms then 500 ms between them covers that lag
// (issue #869, C6).
const PROJECT_ITEM_READ_ATTEMPTS = 3;
const PROJECT_ITEM_RETRY_DELAY_MS = 250;
const GH_ACCEPTED_API_FAILURE = [0, 1];
const NODE_ID_REMEDY = "Pass its numeric item id instead; the items list can lag behind a newly added item.";

// writeProjectStatuses is synchronous for closure apply and the CLI, so the
// wait between reads blocks.
function blockingSleep(milliseconds) {
  const buffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  Atomics.wait(new Int32Array(buffer), 0, 0, milliseconds);
}

// A node id can only be found through the items list, which lags behind a newly
// added item, so the stop names the input that avoids the list.
function missingItemError(itemId) {
  if (isNumericItemId(itemId)) {
    return new Error(`Project item ${itemId} was missing from readback.`);
  }
  const missing = `Project item ${itemId} was missing from readback.`;
  return new Error(`${missing} ${NODE_ID_REMEDY}`);
}

function readFailure(result, itemId) {
  const text = result?.stderr?.trim() || result?.stdout?.trim();
  const exited = `Project item ${itemId} read exited with ${result?.status}.`;
  return new Error(text || exited);
}

// Returns null only when every bounded read answered 404; any other failure
// stops at once, because only a 404 is the known lag.
function readSingleProjectItem({ commandRunner, sleep, ...target }) {
  const command = buildProjectItemReadCommand(target);
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
      throw readFailure(result, target.itemId);
    }
  }
  return null;
}

export {
  blockingSleep,
  missingItemError,
  PROJECT_ITEM_READ_ATTEMPTS,
  PROJECT_ITEM_RETRY_DELAY_MS,
  readSingleProjectItem,
};
