// Repository identity shared by the closure helper and the queue classifier. The snapshot builder and the closure index
// must agree on what a repository name is, so both read every owner/name and GitHub API URL through this module.

// The owner/name class: the characters GitHub allows in an owner or repository name.
const OWNER_AND_NAME = String.raw`[\w.-]+/[\w.-]+`;
const API_PREFIX = String.raw`^https://api\.github\.com/repos/`;
const REPOSITORY_NAME = new RegExp(`^${OWNER_AND_NAME}$`, "u");
const API_REPOSITORY_URL = new RegExp(`${API_PREFIX}(${OWNER_AND_NAME})$`, "u");
const API_ISSUE_URL = new RegExp(String.raw`${API_PREFIX}(${OWNER_AND_NAME})/issues/(\d+)$`, "u");
const API_PULL_URL = new RegExp(String.raw`${API_PREFIX}(${OWNER_AND_NAME})/pulls/(\d+)$`, "u");
const API_RECORD_URL = new RegExp(String.raw`${API_PREFIX}(${OWNER_AND_NAME})/(?:issues|pulls)/\d+$`, "u");

// Whether a value is an owner/name string. Only a string can be one.
function isRepositoryName(value) {
  return typeof value === "string" && REPOSITORY_NAME.test(value);
}

// The owner/name a value names, as spelled, or null. A value that does not parse is no identity at all,
// so no caller falls back to another source or to the target repository.
function repositoryName(value) {
  if (isRepositoryName(value)) {
    return value;
  }
  const name = value?.full_name ?? value?.nameWithOwner;
  if (isRepositoryName(name)) {
    return name;
  }
  return null;
}

// The match a URL makes against pattern, or null when the URL is not a string or does not match.
function urlMatch(url, pattern) {
  if (typeof url !== "string") {
    return null;
  }
  return pattern.exec(url);
}

// The owner/name a URL captures through pattern, or null.
function urlRepository(url, pattern) {
  const match = urlMatch(url, pattern);
  if (match === null) {
    return null;
  }
  return match[1];
}

// The owner/name and number a URL captures through a pattern with a number group, or null.
function urlReference(url, pattern) {
  const match = urlMatch(url, pattern);
  if (match === null) {
    return null;
  }
  return { repository: match[1], number: Number(match[2]) };
}

export {
  API_ISSUE_URL,
  API_PULL_URL,
  API_RECORD_URL,
  API_REPOSITORY_URL,
  isRepositoryName,
  REPOSITORY_NAME,
  repositoryName,
  urlReference,
  urlRepository,
};
