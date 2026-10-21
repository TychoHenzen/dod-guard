import { isListRead, isSingleItemRead } from "./project-status-calls.mjs";
import { ITEM_IDS, NOT_FOUND_RESULT } from "./project-status-data.mjs";

function mapListedItems(result, change) {
  const pages = JSON.parse(result.stdout).map((page) => page.flatMap(change));
  return { ...result, stdout: JSON.stringify(pages) };
}

// The items list omits the first item, as it can right after an add.
export function omitFirst() {
  return { listOmits: new Set([ITEM_IDS[0]]) };
}

// listOmits models the items list lagging behind the single-item endpoint;
// notFoundReads makes that many single-item reads answer 404 first, as the
// endpoint does right after an item is added.
export function laggingRunner(fixture, lag) {
  const { calls, runner } = fixture;
  const { listOmits = new Set(), notFoundReads = 0 } = lag;
  let pendingNotFound = notFoundReads;
  const kept = ({ node_id: nodeId }) => !listOmits.has(nodeId);
  const omit = (item) => [item].filter(kept);
  const lagged = (args) => {
    const result = runner(args);
    if (isListRead(args)) {
      return mapListedItems(result, omit);
    }
    if (isSingleItemRead(args) && pendingNotFound > 0) {
      pendingNotFound -= 1;
      return NOT_FOUND_RESULT;
    }
    return result;
  };
  return { calls, runner: lagged };
}

// The first readback keeps the true identity so the identity change shows up
// only after the PATCH. A numeric input is read through the single-item
// endpoint and a node input through the list, so both reads count.
function alterIfTarget(item, alterItem) {
  if (item.node_id !== ITEM_IDS[0]) {
    return item;
  }
  return alterItem(item);
}

export function alterTargetInLaterReads(runner, alterItem) {
  let itemReads = 0;
  const alterTarget = (item) => alterIfTarget(item, alterItem);
  return (args) => {
    const result = runner(args);
    const singleRead = isSingleItemRead(args);
    if (!(isListRead(args) || singleRead)) {
      return result;
    }
    itemReads += 1;
    if (itemReads === 1) {
      return result;
    }
    if (singleRead) {
      const item = alterTarget(JSON.parse(result.stdout));
      return { ...result, stdout: JSON.stringify(item) };
    }
    return mapListedItems(result, (item) => [alterTarget(item)]);
  };
}

export function recordingSleep() {
  const delays = [];
  return { delays, sleep: (milliseconds) => delays.push(milliseconds) };
}

export function timedOutPatchRunner({ calls, runner }) {
  return (args) => {
    if (args.includes("PATCH")) {
      calls.push([...args]);
      throw new Error("status write timed out");
    }
    return runner(args);
  };
}
