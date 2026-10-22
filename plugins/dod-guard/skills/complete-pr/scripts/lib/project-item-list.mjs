import { githubResponseContractError, githubResponseError } from "./gh-runner.mjs";
import { isBlankId, projectItemId, projectItemIssueNumber } from "./project-item-ids.mjs";
import { projectItemRepository } from "./project-item-repository.mjs";

const JSON_LINE_SEPARATOR = /\r?\n/u;
// The one definition of a pull request Project item; the closure snapshot imports it.
export const PULL_REQUEST_CONTENT_TYPE = "PullRequest";
const PROJECT_ITEM_IDENTITY_JQ = [
  ".[] | {id: .id, node_id: .node_id, content_type: .content_type,",
  "content: {number: .content.number,",
  "repository: {full_name: .content.repository.full_name, fullName: .content.repository.fullName},",
  "repository_url: .content.repository_url}}",
].join(" ");

function commandFailureDetail(result) {
  return result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`;
}

function ghJsonLines(endpoint, filter, commandRunner) {
  const result = commandRunner(["api", "--paginate", "--jq", filter, endpoint], [0]);
  if (result.status !== 0) {
    throw new Error(commandFailureDetail(result));
  }
  const lines = String(result.stdout ?? "")
    .split(JSON_LINE_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw githubResponseContractError(endpoint, "newline-delimited JSON Project items");
  }
}

function requireObjectItem(item, endpoint) {
  if (!item || typeof item !== "object") {
    throw githubResponseContractError(endpoint, "object Project items");
  }
}

function globalIdOf(item, endpoint) {
  const nodeId = item.node_id ?? item.nodeId;
  if (isBlankId(nodeId)) {
    throw githubResponseError(endpoint, "items with global IDs");
  }
  return String(nodeId);
}

// Every listed item, pull request items included, must carry unique REST and global IDs.
function claimProjectItemIds(item, seen, endpoint) {
  const id = projectItemId(item, endpoint);
  const nodeId = globalIdOf(item, endpoint);
  if (seen.ids.has(id) || seen.nodeIds.has(nodeId)) {
    throw githubResponseContractError(endpoint, "unique Project items");
  }
  seen.ids.add(id);
  seen.nodeIds.add(nodeId);
}

// ASSUMPTION: an item typed PullRequest is never the item of the issue being read. A number names an
// issue or a pull request, not both, and the live REST content of such an item has no repository key
// (Project 2 item 273009693). It is skipped, not placed. Any other content type is validated as before.
function isPullRequestListItem(item) {
  return item.content_type === PULL_REQUEST_CONTENT_TYPE;
}

function claimMembership(item, seenMembership, endpoint) {
  const membership = `${projectItemRepository(item, endpoint)}#${projectItemIssueNumber(item, endpoint)}`;
  if (seenMembership.has(membership)) {
    throw githubResponseContractError(endpoint, "unique repository issue membership; exactly one matching issue item");
  }
  seenMembership.add(membership);
}

export function projectItemsForRead(endpoint, commandRunner) {
  const items = ghJsonLines(endpoint, PROJECT_ITEM_IDENTITY_JQ, commandRunner);
  const seen = { ids: new Set(), nodeIds: new Set() };
  const seenMembership = new Set();
  const issueItems = [];
  for (const item of items) {
    requireObjectItem(item, endpoint);
    claimProjectItemIds(item, seen, endpoint);
    if (isPullRequestListItem(item)) {
      continue;
    }
    claimMembership(item, seenMembership, endpoint);
    issueItems.push(item);
  }
  return issueItems;
}
