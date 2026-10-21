import { githubResponseContractError } from "./gh-runner.mjs";
import { isPresent } from "./project-item-ids.mjs";

const PROJECT_REPOSITORY_IDENTITY_KEYS = ["full_name", "fullName"];
const API_REPOSITORY_PATH = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function repositoryName(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

// The item's content, once both it and its repository are objects to read.
function itemContent(item, endpoint) {
  const content = item?.content;
  if (!isPlainObject(content)) {
    throw githubResponseContractError(endpoint, "Project items with content identity");
  }
  if (!isPlainObject(content.repository)) {
    throw githubResponseContractError(endpoint, "Project items with repository identity");
  }
  return content;
}

// Each full-name spelling the repository carries, normalized; a present but
// blank spelling is a contract error rather than a missing one.
function fullNameIdentities(repository, endpoint) {
  const present = PROJECT_REPOSITORY_IDENTITY_KEYS.map((key) => repository[key]).filter(isPresent);
  return present.map((fullName) => {
    const normalized = repositoryName(fullName);
    if (normalized === null) {
      throw githubResponseContractError(endpoint, "a non-blank repository identity");
    }
    return normalized;
  });
}

// owner/name from repository_url, or nothing when the item carries no URL.
function urlIdentities(url, endpoint) {
  if (!isPresent(url)) {
    return [];
  }
  const match = typeof url === "string" && url.match(API_REPOSITORY_PATH);
  if (!match) {
    throw githubResponseContractError(endpoint, "a canonical repository URL");
  }
  return [repositoryName(match[1])];
}

// Every spelling must agree, so an item cannot be counted under two
// repositories; full names are checked before the URL, as callers expect.
export function projectItemRepository(item, endpoint) {
  const content = itemContent(item, endpoint);
  const identities = [
    ...fullNameIdentities(content.repository, endpoint),
    ...urlIdentities(content.repository_url, endpoint),
  ];
  if (identities.length === 0) {
    throw githubResponseContractError(endpoint, "a non-blank repository identity");
  }
  if (new Set(identities).size > 1) {
    throw githubResponseContractError(endpoint, "one non-contradictory repository identity");
  }
  return identities[0];
}
