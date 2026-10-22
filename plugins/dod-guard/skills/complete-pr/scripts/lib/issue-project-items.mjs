// The one read that places an issue in GitHub Projects: the issue's own projectItems relation in a
// single GraphQL query, with each item's Status value and its Project's number and owner. The REST
// Project items list is not used for this. It answered identical requests with 99, 99, 0, and 113
// items (HTTP 200 with a next link), so a missing row there cannot mean "not an item of the Project".
// Here an absent item is meaningful only because the whole relation arrived in one complete response;
// every incomplete or failed read throws, and the caller exits 2.
import { isRepositoryName } from "../../../../lib/repository-identity.mjs";
import { githubResponseContractError } from "./gh-runner.mjs";
import { ISSUE_PROJECT_ITEMS_READ, issueProjectItemsReadArgs } from "./issue-project-items-query.mjs";

function contractError(detail) {
  return githubResponseContractError(ISSUE_PROJECT_ITEMS_READ, detail);
}

function projectOf(node) {
  const project = node?.project;
  const login = project?.owner?.login;
  if (!Number.isInteger(project?.number) || typeof project?.closed !== "boolean" || typeof login !== "string") {
    throw contractError("items with a Project number, closed flag, and owner login");
  }
  return { number: project.number, closed: project.closed, ownerLogin: login };
}

// Null when the item has no Status value. Only the item the caller asked about must have one, so the
// check belongs to that caller and an unrelated Project's blank Status cannot fail the read.
function statusOf(node) {
  const name = node?.fieldValueByName?.name;
  if (typeof name !== "string" || name.trim() === "") {
    return null;
  }
  return name;
}

function parseResponse(stdout) {
  let response;
  try {
    response = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${ISSUE_PROJECT_ITEMS_READ}: did not return JSON`, { cause: error });
  }
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error(`${ISSUE_PROJECT_ITEMS_READ}: GraphQL errors ${JSON.stringify(response.errors)}`);
  }
  return response;
}

// The projectItems relation of a parsed response, or a throw for a response that is not the
// documented shape or a page that is not the last.
function completeRelation(response) {
  const items = response?.data?.repository?.issue?.projectItems;
  if (!(Array.isArray(items?.nodes) && typeof items?.pageInfo?.hasNextPage === "boolean")) {
    throw contractError("the issue's projectItems with nodes and pageInfo");
  }
  if (items.pageInfo.hasNextPage) {
    throw contractError("every Project item of the issue on one page");
  }
  return items;
}

function requestProjectItems(repository, issueNumber, runner) {
  const result = runner(issueProjectItemsReadArgs(repository, issueNumber), [0]);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`);
  }
  return completeRelation(parseResponse(result.stdout));
}

// Every Project item of the issue as {number, closed, ownerLogin, status|null}.
function readIssueProjectItems(repository, issueNumber, runner) {
  if (!isRepositoryName(repository)) {
    throw new Error("Repository must be in owner/name form.");
  }
  const { nodes } = requestProjectItems(repository, issueNumber, runner);
  return nodes.map((node) => ({ ...projectOf(node), status: statusOf(node) }));
}

export { readIssueProjectItems };
