// The REST reads of a GitHub Project that complete-pr's scripts make, as one entry
// point over the focused modules beside it: project-listing (owned and open
// Projects), project-item-list, project-item-repository, project-item-readback and
// project-item-ids (Project items), project-item-status and project-status-value
// (Status values), project-issue-status (the issue resolver), and project-read-error
// (the failure type). readIssueProjectStatuses wants the open Project holding
// exactly one item for one issue and stops on an item it cannot place. Which Project
// a repository is linked to is a different rule, read from the explicit link by
// plugins/dod-guard/lib/linked-project.mjs. Every read goes through an injected
// runner in gh-runner's convention.
import { API_REPOSITORY_URL, isRepositoryName, urlRepository } from "../../../../lib/repository-identity.mjs";
import { isPresent } from "./project-item-ids.mjs";
import { ProjectReadError } from "./project-read-error.mjs";

export { readIssueProjectStatuses } from "./project-issue-status.mjs";
export { PULL_REQUEST_CONTENT_TYPE } from "./project-item-list.mjs";
export { isNotFoundResult, ProjectReadError } from "./project-read-error.mjs";
export { statusValueName } from "./project-status-value.mjs";

function fullNameRepository(fullName, endpoint) {
  if (!isRepositoryName(fullName)) {
    throw new ProjectReadError(endpoint, "content repository full_name must name a repository");
  }
  return fullName;
}

function urlContentRepository(url, endpoint) {
  const repository = urlRepository(url, API_REPOSITORY_URL);
  if (repository === null) {
    throw new ProjectReadError(endpoint, "content repository_url must name a repository");
  }
  return repository;
}

// The owner/name an item's content names, as GitHub spells it, or null for content that names none
// (a draft issue). A name or repository URL that is present and does not parse is a failed read, not a
// missing name.
export function contentRepository(content, endpoint) {
  const fullName = content?.repository?.full_name;
  if (isPresent(fullName)) {
    return fullNameRepository(fullName, endpoint);
  }
  if (!isPresent(content?.repository_url)) {
    return null;
  }
  return urlContentRepository(content.repository_url, endpoint);
}

// A list that can span pages, read with --paginate --slurp, which returns one array per page.
export function readSlurpedPages(read, endpoint) {
  const { stdout } = read(["api", "--paginate", "--slurp", endpoint]);
  let pages;
  try {
    pages = JSON.parse(stdout);
  } catch (error) {
    throw new ProjectReadError(endpoint, "did not return JSON", { cause: error });
  }
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw new ProjectReadError(endpoint, "missing page: every page must be an array");
  }
  return pages.flat();
}

export function sameRepository(name, repository) {
  if (typeof name !== "string") {
    return false;
  }
  return name.toLowerCase() === repository.toLowerCase();
}
