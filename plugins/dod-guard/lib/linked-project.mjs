// The one rule for which GitHub Project a repository belongs to: the open Project explicitly linked to
// it. REST has no endpoint for that link (repos/<owner>/<name>/projectsV2 answers 404), so this is a
// documented capability-only GraphQL read, made once, with no fallback to the owner's Project list or
// to item membership. The classifier is pure; the resolver makes the one read through an injected
// runner in gh-runner's convention, so this module never starts gh itself.
import { isRepositoryName } from "./repository-identity.mjs";

const LINKED_PROJECT_READ = "graphql repository.projectsV2";

// ProjectV2Owner is an interface without login, so the live API rejects owner { login } and each
// owner type must be named by an inline fragment.
const LINKED_PROJECT_QUERY =
  "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { projectsV2(first: 100) { nodes { id number title closed owner { __typename ... on User { login } ... on Organization { login } } } pageInfo { hasNextPage } } } }";

// A Map, because the keys are GraphQL type names and must keep their spelling.
const OWNER_BASE = new Map([
  ["User", "users"],
  ["Organization", "orgs"],
]);
// gh api graphql exits 1 when the response carries an errors array, and still prints it on stdout.
const GRAPHQL_ERROR_EXIT = 1;
const OWNER_PREFIX = "owner=";
const NAME_PREFIX = "name=";
const QUERY_ARG = `query=${LINKED_PROJECT_QUERY}`;
// api, graphql, then -f and a value for each of query, owner, and name.
const READ_ARG_COUNT = 8;

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

// -f, not -F: -F coerces numeric and boolean text, so a repository named 123 or true would reach
// GraphQL as a non-String variable.
function linkedProjectReadArgs(repository) {
  const [owner, name] = repository.split("/");
  return ["api", "graphql", "-f", QUERY_ARG, "-f", `${OWNER_PREFIX}${owner}`, "-f", `${NAME_PREFIX}${name}`];
}

// True only for the exact documented read, so a guard that forbids routine GraphQL can let this one
// through and still reject every other query, including another projectsV2 query.
function isLinkedProjectRead(args) {
  if (!Array.isArray(args) || args.length !== READ_ARG_COUNT) {
    return false;
  }
  const [api, graphql, queryFlag, query, ownerFlag, owner, nameFlag, name] = args.map(String);
  return (
    api === "api" &&
    graphql === "graphql" &&
    [queryFlag, ownerFlag, nameFlag].every((flag) => flag === "-f") &&
    query === QUERY_ARG &&
    owner.startsWith(OWNER_PREFIX) &&
    name.startsWith(NAME_PREFIX) &&
    isRepositoryName(`${owner.slice(OWNER_PREFIX.length)}/${name.slice(NAME_PREFIX.length)}`)
  );
}

function errorMessage(error) {
  if (nonBlank(error?.message)) {
    return error.message;
  }
  return JSON.stringify(error);
}

function projectOf(node) {
  const owner = node?.owner;
  const base = OWNER_BASE.get(owner?.__typename);
  const wellFormed =
    isObject(node) &&
    nonBlank(node.id) &&
    Number.isInteger(node.number) &&
    node.number > 0 &&
    typeof node.title === "string" &&
    typeof node.closed === "boolean" &&
    base !== undefined &&
    nonBlank(owner.login);
  // ASSUMPTION: a null node (a Project the token cannot see) is malformed rather than skipped, because
  // skipping it could turn "several" into "resolved".
  if (!wellFormed) {
    throw new LinkedProjectError(`malformed Project node ${JSON.stringify(node)}`);
  }
  return {
    closed: node.closed,
    project: {
      ownerLogin: owner.login,
      ownerType: owner.__typename,
      basePath: `${base}/${owner.login}`,
      number: node.number,
      title: node.title,
      id: node.id,
    },
  };
}

function connectionOf(response) {
  if (!isObject(response)) {
    throw new LinkedProjectError("did not return a JSON object");
  }
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    throw new LinkedProjectError(`returned errors: ${response.errors.map(errorMessage).join("; ")}`);
  }
  const repository = response.data?.repository;
  if (repository === null || repository === undefined) {
    throw new LinkedProjectError("named no repository");
  }
  const connection = repository.projectsV2;
  if (!(isObject(connection) && Array.isArray(connection.nodes) && isObject(connection.pageInfo))) {
    throw new LinkedProjectError("must include projectsV2 nodes and pageInfo");
  }
  if (typeof connection.pageInfo.hasNextPage !== "boolean") {
    throw new LinkedProjectError("must include a boolean pageInfo.hasNextPage");
  }
  if (connection.pageInfo.hasNextPage) {
    throw new LinkedProjectError("is incomplete: more than 100 linked Projects, so hasNextPage is true");
  }
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

// The count rule, shared with callers that already hold a list of linked Projects (setup-repository's
// protection snapshot). Only an entry whose closed flag is exactly false counts as open, so a
// malformed entry can never be the one that makes a list "resolved".
function classifyOpenProjects(entries) {
  const open = entries.filter((entry) => entry?.closed === false);
  return { outcome: outcomeOf(open.length), open };
}

// Every node is checked, closed ones included, before closed Projects are dropped, so a malformed
// entry stops the read wherever it sits.
function classifyLinkedProjects(response) {
  const { outcome, open } = classifyOpenProjects(connectionOf(response).nodes.map(projectOf));
  return { outcome, projects: open.map(({ project }) => project) };
}

// "none", or the count and numbers, for the stop text the closure snapshot keeps.
function describeLinkedProjects(projects) {
  if (projects.length === 0) {
    return "none";
  }
  return `${projects.length} (${projects.map(({ number }) => `#${number}`).join(", ")})`;
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

function failureDetail(result) {
  const text = String(result?.stderr ?? "").trim() || String(result?.stdout ?? "").trim();
  return text || `gh exited with ${result?.status}`;
}

// The one read. An exit 1 that carries GraphQL errors on stdout is reported as those errors; any other
// failure is a gh failure. Both throw, because only a complete answer can be classified.
function resolveLinkedProject(repository, runner) {
  if (!isRepositoryName(repository)) {
    throw new LinkedProjectError(`repository must be owner/name, got ${JSON.stringify(repository)}`);
  }
  let result;
  try {
    result = runner(linkedProjectReadArgs(repository), [0, GRAPHQL_ERROR_EXIT]);
  } catch (error) {
    throw new LinkedProjectError(`gh failed: ${messageOf(error)}`, { cause: error });
  }
  const response = responseOf(result);
  const graphqlErrors = result?.status === GRAPHQL_ERROR_EXIT && Array.isArray(response?.errors);
  if (result?.status !== 0 && !graphqlErrors) {
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
