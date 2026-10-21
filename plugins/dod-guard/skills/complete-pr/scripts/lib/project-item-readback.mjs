import { githubResponseContractError } from "./gh-runner.mjs";
import { projectItemId, projectItemIssueNumber } from "./project-item-ids.mjs";
import { projectItemRepository, repositoryName } from "./project-item-repository.mjs";

export function projectItemMatchesRepository(item, issue, endpoint) {
  const number = projectItemIssueNumber(item, endpoint);
  const itemRepository = projectItemRepository(item, endpoint);
  return number === issue.number && itemRepository === repositoryName(issue.repository);
}

function nodeIdOf(item) {
  return String(item?.node_id ?? item?.nodeId ?? "");
}

function sameItemIds(item, expected, endpoint) {
  const expectedId = projectItemId(expected, endpoint);
  const actualId = projectItemId(item, endpoint);
  const expectedNodeId = nodeIdOf(expected);
  const actualNodeId = nodeIdOf(item);
  return (
    expectedNodeId.length > 0 && actualNodeId.length > 0 && expectedId === actualId && expectedNodeId === actualNodeId
  );
}

export function validateProjectItemReadback({ item, expected }, issue, endpoint) {
  if (!sameItemIds(item, expected, endpoint)) {
    throw githubResponseContractError(endpoint, "the same Project item IDs as the membership read");
  }
  if (!projectItemMatchesRepository(item, issue, endpoint)) {
    throw githubResponseContractError(endpoint, "the same repository and issue identity as the membership read");
  }
}
