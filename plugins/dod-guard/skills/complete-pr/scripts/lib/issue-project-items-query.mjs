// The one GraphQL query that places an issue in GitHub Projects, with the exact
// gh argument list that sends it and the check that recognizes that list. A guard
// that forbids routine GraphQL can admit this read and still reject every other.
import { isRepositoryName } from "../../../../lib/repository-identity.mjs";

const ISSUE_PROJECT_ITEMS_READ = "graphql repository.issue.projectItems";

const PAGE_SIZE = 100;
const QUERY = [
  "query($owner: String!, $name: String!, $number: Int!) {",
  "repository(owner: $owner, name: $name) {",
  "issue(number: $number) {",
  `projectItems(first: ${PAGE_SIZE}) {`,
  "nodes { project { number closed owner {",
  "__typename ... on User { login } ... on Organization { login }",
  "} }",
  'fieldValueByName(name: "Status") { __typename ... on ProjectV2ItemFieldSingleSelectValue { name } } }',
  "pageInfo { hasNextPage }",
  "} } } }",
].join(" ");

const QUERY_ARG = `query=${QUERY}`;
// api, graphql, then query, owner, and name as strings (-f) and the number as an Int (-F), with the
// three variable values left blank because they vary.
const READ_ARGS = ["api", "graphql", "-f", QUERY_ARG, "-f", "", "-f", "", "-F", ""];
const ISSUE_NUMBER = /^[1-9][0-9]*$/u;
const OWNER_PREFIX = "owner=";
const NAME_PREFIX = "name=";
const NUMBER_PREFIX = "number=";
const VARIABLE_SLOTS = READ_ARGS.map((_, at) => at).filter((at) => READ_ARGS[at] === "");

// -f for owner and name so a repository named 123 or true stays a String; -F for the number so it
// reaches GraphQL as an Int.
function issueProjectItemsReadArgs(repository, issueNumber) {
  const [owner, name] = repository.split("/");
  return [
    "api",
    "graphql",
    "-f",
    QUERY_ARG,
    "-f",
    `${OWNER_PREFIX}${owner}`,
    "-f",
    `${NAME_PREFIX}${name}`,
    "-F",
    `${NUMBER_PREFIX}${issueNumber}`,
  ];
}

function hasDocumentedShape(args) {
  if (!Array.isArray(args) || args.length !== READ_ARGS.length) {
    return false;
  }
  return READ_ARGS.every((arg, at) => arg === "" || String(args[at]) === arg);
}

// The repository and number the variable slots carry, or null when a slot lacks its prefix.
function variablesOf(args) {
  const [owner, name, number] = VARIABLE_SLOTS.map((at) => String(args[at]));
  const prefixed = owner.startsWith(OWNER_PREFIX) && name.startsWith(NAME_PREFIX) && number.startsWith(NUMBER_PREFIX);
  if (!prefixed) {
    return null;
  }
  return {
    repository: `${owner.slice(OWNER_PREFIX.length)}/${name.slice(NAME_PREFIX.length)}`,
    number: number.slice(NUMBER_PREFIX.length),
  };
}

// True only for the exact documented read.
function isIssueProjectItemsRead(args) {
  if (!hasDocumentedShape(args)) {
    return false;
  }
  const variables = variablesOf(args);
  return variables !== null && isRepositoryName(variables.repository) && ISSUE_NUMBER.test(variables.number);
}

export { ISSUE_PROJECT_ITEMS_READ, isIssueProjectItemsRead, issueProjectItemsReadArgs };
