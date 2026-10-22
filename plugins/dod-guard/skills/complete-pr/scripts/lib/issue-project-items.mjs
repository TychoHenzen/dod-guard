// The one read that places an issue in GitHub Projects: the issue's own projectItems relation in a
// single GraphQL query, with each item's Status value and its Project's number and owner. The REST
// Project items list is not used for this. It answered identical requests with 99, 99, 0, and 113
// items (HTTP 200 with a next link), so a missing row there cannot mean "not an item of the Project".
// Here an absent item is meaningful only because the whole relation arrived in one complete response;
// every incomplete or failed read throws, and the caller exits 2.
import { isRepositoryName } from "../../../../lib/repository-identity.mjs";
import { githubResponseContractError } from "./gh-runner.mjs";

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

// True only for the exact documented read, so a guard that forbids routine GraphQL can admit this
// one and still reject every other query.
function isIssueProjectItemsRead(args) {
  if (!Array.isArray(args) || args.length !== READ_ARGS.length) {
    return false;
  }
  const values = args.map(String);
  if (!READ_ARGS.every((arg, at) => arg === "" || values[at] === arg)) {
    return false;
  }
  const [owner, name, number] = VARIABLE_SLOTS.map((at) => values[at]);
  if (!(owner.startsWith(OWNER_PREFIX) && name.startsWith(NAME_PREFIX) && number.startsWith(NUMBER_PREFIX))) {
    return false;
  }
  const repository = `${owner.slice(OWNER_PREFIX.length)}/${name.slice(NAME_PREFIX.length)}`;
  return isRepositoryName(repository) && ISSUE_NUMBER.test(number.slice(NUMBER_PREFIX.length));
}

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

// Every Project item of the issue as {number, closed, ownerLogin, status|null}. A null issue, a response
// that is not the documented shape, and a page that is not the last all throw.
function readIssueProjectItems(repository, issueNumber, runner) {
  if (!isRepositoryName(repository)) {
    throw new Error("Repository must be in owner/name form.");
  }
  const result = runner(issueProjectItemsReadArgs(repository, issueNumber), [0]);
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `gh exited with ${result.status}`);
  }
  const items = parseResponse(result.stdout)?.data?.repository?.issue?.projectItems;
  if (!(Array.isArray(items?.nodes) && typeof items?.pageInfo?.hasNextPage === "boolean")) {
    throw contractError("the issue's projectItems with nodes and pageInfo");
  }
  if (items.pageInfo.hasNextPage) {
    throw contractError("every Project item of the issue on one page");
  }
  return items.nodes.map((node) => ({ ...projectOf(node), status: statusOf(node) }));
}

export { ISSUE_PROJECT_ITEMS_READ, isIssueProjectItemsRead, issueProjectItemsReadArgs, readIssueProjectItems };
