// The request half of the linked-Project rule: the one documented GraphQL
// read of repository.projectsV2 and the exact-match check that lets a guard
// forbidding routine GraphQL admit this read and nothing else. REST has no
// endpoint for the link (repos/<owner>/<name>/projectsV2 answers 404), so
// this capability-only read is the only way to see it.
import { isRepositoryName } from "./repository-identity.mjs";

export const LINKED_PROJECT_READ = "graphql repository.projectsV2";

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

const OWNER_PREFIX = "owner=";
const NAME_PREFIX = "name=";
const QUERY_ARG = `query=${LINKED_PROJECT_QUERY}`;
// api, graphql, then -f and a value for each of query, owner, and name, with
// the owner and name values left blank because they vary.
const READ_ARGS = ["api", "graphql", "-f", QUERY_ARG, "-f", "", "-f", ""];

// Named after the read so every stop says which request failed, whichever
// half of the rule raised it.
export class LinkedProjectError extends Error {
  constructor(detail, options) {
    super(`${LINKED_PROJECT_READ}: ${detail}`, options);
    this.name = "LinkedProjectError";
    this.read = LINKED_PROJECT_READ;
    this.detail = detail;
  }
}

// -f, not -F: -F coerces numeric and boolean text, so a repository named 123
// or true would reach GraphQL as a non-String variable.
export function linkedProjectReadArgs(repository) {
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
export function isLinkedProjectRead(args) {
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
