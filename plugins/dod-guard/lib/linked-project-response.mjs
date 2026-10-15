// The response half of the linked-Project rule: checks the projectsV2
// connection the documented read returns and counts its open Projects. Pure,
// so a caller that already holds a list of linked Projects (setup-repository's
// protection snapshot) applies the same count rule without a read.
import { LinkedProjectError } from "./linked-project-read.mjs";

// A Map, because the keys are GraphQL type names and must keep their spelling.
const OWNER_BASE = new Map([
  ["User", "users"],
  ["Organization", "orgs"],
]);
// The read asks for projectsV2(first: 100) and fetches no further page.
const PAGE_LIMIT = "is incomplete: more than 100 linked Projects";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function errorMessage(error) {
  if (nonBlank(error?.message)) {
    return error.message;
  }
  return JSON.stringify(error);
}

function hasProjectFields(node) {
  const positive = Number.isInteger(node.number) && node.number > 0;
  const titled = typeof node.title === "string";
  const flagged = typeof node.closed === "boolean";
  return nonBlank(node.id) && positive && titled && flagged;
}

function isWellFormedNode(node, base) {
  const owned = base !== undefined && nonBlank(node?.owner?.login);
  return isObject(node) && hasProjectFields(node) && owned;
}

function projectOf(node) {
  const base = OWNER_BASE.get(node?.owner?.__typename);
  // ASSUMPTION: a null node (a Project the token cannot see) is malformed
  // rather than skipped, because skipping it could turn "several" into
  // "resolved".
  if (!isWellFormedNode(node, base)) {
    const shown = JSON.stringify(node);
    throw new LinkedProjectError(`malformed Project node ${shown}`);
  }
  const { login, __typename } = node.owner;
  return {
    closed: node.closed,
    project: {
      ownerLogin: login,
      ownerType: __typename,
      basePath: `${base}/${login}`,
      number: node.number,
      title: node.title,
      id: node.id,
    },
  };
}

function rejectErrors(response) {
  const { errors } = response;
  if (Array.isArray(errors) && errors.length > 0) {
    const messages = errors.map(errorMessage).join("; ");
    throw new LinkedProjectError(`returned errors: ${messages}`);
  }
}

function repositoryOf(response) {
  const repository = response.data?.repository;
  if (repository === null || repository === undefined) {
    throw new LinkedProjectError("named no repository");
  }
  return repository;
}

function projectsConnectionOf(response) {
  const connection = repositoryOf(response).projectsV2;
  const nodes = Array.isArray(connection?.nodes);
  if (!(isObject(connection) && nodes && isObject(connection.pageInfo))) {
    throw new LinkedProjectError("must include projectsV2 nodes and pageInfo");
  }
  return connection;
}

function rejectIncompletePage({ hasNextPage }) {
  if (typeof hasNextPage !== "boolean") {
    throw new LinkedProjectError("must include a boolean pageInfo.hasNextPage");
  }
  if (hasNextPage) {
    throw new LinkedProjectError(`${PAGE_LIMIT}, so hasNextPage is true`);
  }
}

function connectionOf(response) {
  if (!isObject(response)) {
    throw new LinkedProjectError("did not return a JSON object");
  }
  rejectErrors(response);
  const connection = projectsConnectionOf(response);
  rejectIncompletePage(connection.pageInfo);
  return connection;
}

function outcomeOf(count) {
  if (count === 0) {
    return "none";
  }
  if (count === 1) {
    return "resolved";
  }
  return "several";
}

// Only an entry whose closed flag is exactly false counts as open, so a
// malformed entry can never be the one that makes a list "resolved".
function classifyOpenProjects(entries) {
  const open = entries.filter((entry) => entry?.closed === false);
  return { outcome: outcomeOf(open.length), open };
}

// Every node is checked, closed ones included, before closed Projects are
// dropped, so a malformed entry stops the read wherever it sits.
function classifyLinkedProjects(response) {
  const nodes = connectionOf(response).nodes.map(projectOf);
  const { outcome, open } = classifyOpenProjects(nodes);
  return { outcome, projects: open.map(({ project }) => project) };
}

export { classifyLinkedProjects, classifyOpenProjects };
