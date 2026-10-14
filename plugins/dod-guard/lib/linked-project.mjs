// The one rule for which GitHub Project a repository belongs to: the open
// Project explicitly linked to it. REST has no endpoint for that link
// (repos/<owner>/<name>/projectsV2 answers 404), so this is a documented
// capability-only GraphQL read, made once, with no fallback to the owner's
// Project list or to item membership. The classifier is pure; the resolver
// makes the one read through an injected runner in gh-runner's convention, so
// this module never starts gh itself.
import { isRepositoryName } from "./repository-identity.mjs";

const LINKED_PROJECT_READ = "graphql repository.projectsV2";

// ProjectV2Owner is an interface without login, so the live API rejects
// owner { login } and each owner type must be named by an inline fragment.
const LINKED_PROJECT_QUERY = [
  "query($owner: String!, $name: String!) {",
  "repository(owner: $owner, name: $name) {",
  "projectsV2(first: 100) {",
  "nodes { id number title closed owner {",
  "__typename ... on User { login } ... on Organization { login }",
  "} }",
  "pageInfo { hasNextPage }",
  "} } }",
].join(" ");

// A Map, because the keys are GraphQL type names and must keep their spelling.
const OWNER_BASE = new Map([
  ["User", "users"],
  ["Organization", "orgs"],
]);
// gh api graphql exits 1 when the response carries an errors array, and still
// prints it on stdout.
const GRAPHQL_ERROR_EXIT = 1;
const OWNER_PREFIX = "owner=";
const NAME_PREFIX = "name=";
const QUERY_ARG = `query=${LINKED_PROJECT_QUERY}`;
// api, graphql, then -f and a value for each of query, owner, and name, with
// the owner and name values left blank because they vary.
const READ_ARGS = ["api", "graphql", "-f", QUERY_ARG, "-f", "", "-f", ""];

class LinkedProjectError extends Error {
  constructor(detail, options) {
    super(`${LINKED_PROJECT_READ}: ${detail}`, options);
    this.name = "LinkedProjectError";
    this.read = LINKED_PROJECT_READ;
    this.detail = detail;
  }
}

function messageOf(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonBlank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// -f, not -F: -F coerces numeric and boolean text, so a repository named 123
// or true would reach GraphQL as a non-String variable.
function linkedProjectReadArgs(repository) {
  const [owner, name] = repository.split("/");
  const ownerArg = `${OWNER_PREFIX}${owner}`;
  const nameArg = `${NAME_PREFIX}${name}`;
  return ["api", "graphql", "-f", QUERY_ARG, "-f", ownerArg, "-f", nameArg];
}

function hasFixedReadArgs(args) {
  return READ_ARGS.every((arg, at) => arg === "" || args[at] === arg);
}

// owner/name from the read's owner and name variables, or null when either
// lacks its prefix.
function repositoryOfRead(values) {
  const isVariable = (_, at) => READ_ARGS[at] === "";
  const [ownerArg, nameArg] = values.filter(isVariable);
  if (!(ownerArg.startsWith(OWNER_PREFIX) && nameArg.startsWith(NAME_PREFIX))) {
    return null;
  }
  const owner = ownerArg.slice(OWNER_PREFIX.length);
  return `${owner}/${nameArg.slice(NAME_PREFIX.length)}`;
}

// True only for the exact documented read, so a guard that forbids routine
// GraphQL can let this one through and still reject every other query,
// including another projectsV2 query.
function isLinkedProjectRead(args) {
  if (!Array.isArray(args) || args.length !== READ_ARGS.length) {
    return false;
  }
  const values = args.map(String);
  if (!hasFixedReadArgs(values)) {
    return false;
  }
  const repository = repositoryOfRead(values);
  return repository !== null && isRepositoryName(repository);
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
    throw new LinkedProjectError("is incomplete: more than 100 linked Projects, so hasNextPage is true");
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

// The count rule, shared with callers that already hold a list of linked
// Projects (setup-repository's protection snapshot). Only an entry whose closed
// flag is exactly false counts as open, so a malformed entry can never be the
// one that makes a list "resolved".
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

// "none", or the count and numbers, for the stop text the closure snapshot
// keeps.
function describeLinkedProjects(projects) {
  if (projects.length === 0) {
    return "none";
  }
  const numbers = projects.map(({ number }) => `#${number}`).join(", ");
  return `${projects.length} (${numbers})`;
}

function responseOf(result) {
  try {
    return JSON.parse(String(result?.stdout ?? ""));
  } catch (error) {
    if (result?.status === 0) {
      throw new LinkedProjectError("did not return JSON", { cause: error });
    }
    return null;
  }
}

function outputText(value) {
  return String(value ?? "").trim();
}

function failureDetail(result) {
  const text = outputText(result?.stderr) || outputText(result?.stdout);
  if (text) {
    return text;
  }
  return `gh exited with ${result?.status}`;
}

function runLinkedProjectRead(repository, runner) {
  try {
    return runner(linkedProjectReadArgs(repository), [0, GRAPHQL_ERROR_EXIT]);
  } catch (error) {
    const detail = `gh failed: ${messageOf(error)}`;
    throw new LinkedProjectError(detail, { cause: error });
  }
}

function carriesGraphqlErrors(result, response) {
  const failed = result?.status === GRAPHQL_ERROR_EXIT;
  return failed && Array.isArray(response?.errors);
}

// The one read. An exit 1 that carries GraphQL errors on stdout is reported as
// those errors; any other failure is a gh failure. Both throw, because only a
// complete answer can be classified.
function resolveLinkedProject(repository, runner) {
  if (!isRepositoryName(repository)) {
    const got = JSON.stringify(repository);
    throw new LinkedProjectError(`repository must be owner/name, got ${got}`);
  }
  const result = runLinkedProjectRead(repository, runner);
  const response = responseOf(result);
  if (result?.status !== 0 && !carriesGraphqlErrors(result, response)) {
    throw new LinkedProjectError(`gh failed: ${failureDetail(result)}`);
  }
  return { repository, ...classifyLinkedProjects(response) };
}

export {
  classifyLinkedProjects,
  classifyOpenProjects,
  describeLinkedProjects,
  isLinkedProjectRead,
  LINKED_PROJECT_QUERY,
  LINKED_PROJECT_READ,
  LinkedProjectError,
  linkedProjectReadArgs,
  resolveLinkedProject,
};
