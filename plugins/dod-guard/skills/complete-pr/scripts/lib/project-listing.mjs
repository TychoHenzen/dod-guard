import { ghJson, ghJsonArrayPages, githubResponseContractError, githubResponseError } from "./gh-runner.mjs";
import { isNotFoundResult } from "./project-read-error.mjs";

// checkEntry runs on every listed Project, closed ones included, so a malformed
// entry stops the read wherever it is; visit runs on each open one, in listing
// order.
export function forEachOpenProject(projects, checkEntry, visit) {
  for (const project of projects) {
    checkEntry(project);
    if (project.state.trim().toLowerCase() === "open") {
      visit(project);
    }
  }
}

export function checkListedIssueProject(project, basePath) {
  if (project?.number === undefined || project?.number === null) {
    throw githubResponseError(`${basePath}/projectsV2`, "projects with a number");
  }
  if (typeof project?.state !== "string" || project.state.trim().length === 0) {
    throw githubResponseContractError(`${basePath}/projectsV2`, "projects with an explicit state");
  }
}

function listingEndpoint(scope, owner) {
  return `${scope}/${owner}/projectsV2?per_page=100`;
}

function userProjectPages(pages, endpoint) {
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
    throw githubResponseError(endpoint, "an array response");
  }
  return pages.flat();
}

function userListingFailure(result) {
  return new Error(result.stderr.trim() || "Failed to list user-owned Projects.");
}

export function listOwnedProjects(owner, commandRunner) {
  const userEndpoint = listingEndpoint("users", owner);
  const userResponse = ghJson(["api", "--paginate", "--slurp", userEndpoint], [0, 1], commandRunner);
  if (userResponse.result.status === 0) {
    return { basePath: `users/${owner}`, projects: userProjectPages(userResponse.data, userEndpoint) };
  }
  if (!isNotFoundResult(userResponse.result)) {
    throw userListingFailure(userResponse.result);
  }
  return {
    basePath: `orgs/${owner}`,
    projects: ghJsonArrayPages(listingEndpoint("orgs", owner), commandRunner),
  };
}
