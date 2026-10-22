// Route tables for the closure snapshot tests: the ENDPOINT path builders, the fake REST runner, and
// the linked-Project reply. The GitHub object shapes the routes answer with live in
// fixtures/rest-shapes.mjs. The *.test-support.mjs name keeps the test glob from running it as a test.
import { isLinkedProjectRead, LINKED_PROJECT_READ } from "../../../../lib/linked-project-read.mjs";
import { failed, OWNER, ok, REPO } from "./fixtures/rest-shapes.mjs";

const FIELD_IDS = [101, 102, 103, 104];

const ENDPOINT = {
  repository: `repos/${REPO}`,
  // The route key for the one GraphQL read, whose last argument is a variable, not an endpoint.
  linkedProjects: LINKED_PROJECT_READ,
  fields: (number) => `users/${OWNER}/projectsV2/${number}/fields?per_page=100`,
  values: (number) => `users/${OWNER}/projectsV2/${number}/items?per_page=100&fields=${FIELD_IDS.join(",")}`,
  subIssues: (number) => `repos/${REPO}/issues/${number}/sub_issues?per_page=100`,
  comments: (number) => `repos/${REPO}/issues/${number}/comments?per_page=100`,
  blockedBy: (number) => `repos/${REPO}/issues/${number}/dependencies/blocked_by?per_page=100`,
  branches: `repos/${REPO}/git/matching-refs/heads/codex/?per_page=100`,
  openPulls: `repos/${REPO}/pulls?state=open&per_page=100`,
  protection: `repos/${REPO}/branches/master/protection/required_status_checks`,
  checkRuns: (sha) => `repos/${REPO}/commits/${sha}/check-runs?per_page=100`,
  statuses: (sha) => `repos/${REPO}/commits/${sha}/status?per_page=100`,
};

const SERVER_ERROR = failed("gh: Server Error (HTTP 500)");
const NOT_FOUND = failed("gh: Not Found (HTTP 404)");

// A Project node in the shape the live repository.projectsV2 read returned on 2026-10-14.
function linkedProjectNode(number, { closed = false, login = OWNER, typename = "User" } = {}) {
  return {
    id: `PVT_${number}`,
    number,
    title: `Project ${number}`,
    closed,
    owner: { __typename: typename, login },
  };
}

// The linked-Project read's answer: the repository's explicit links, closed ones included.
function linkedProjectsReply(nodes, { hasNextPage = false } = {}) {
  const projectsV2 = { nodes, pageInfo: { hasNextPage } };
  return ok({ data: { repository: { projectsV2 } } });
}

function endpointOf(args) {
  if (isLinkedProjectRead(args)) {
    return ENDPOINT.linkedProjects;
  }
  if (args.includes("graphql")) {
    throw new Error(`forbidden GraphQL request: ${args.join(" ")}`);
  }
  return args.at(-1);
}

function failureText(reply) {
  return reply.stderr || reply.stdout || `gh exited with ${reply.status}`;
}

function replyFor(routes, endpoint, acceptedExitCodes) {
  const reply = routes[endpoint];
  if (reply === undefined) {
    throw new Error(`no fixture for ${endpoint}`);
  }
  if (!acceptedExitCodes.includes(reply.status)) {
    throw new Error(failureText(reply));
  }
  return reply;
}

// Answers each endpoint from its route and honors acceptedExitCodes the way the shared runGh in
// gh-runner.mjs does. An endpoint without a route throws, so a read the fixture does not expect
// fails the test. The documented linked-Project read is the only GraphQL it answers.
function fakeRest(routes) {
  const calls = [];
  const runner = (args, acceptedExitCodes = [0]) => {
    calls.push(args);
    return replyFor(routes, endpointOf(args), acceptedExitCodes);
  };
  return { runner, calls };
}

export { ENDPOINT, fakeRest, linkedProjectNode, linkedProjectsReply, NOT_FOUND, SERVER_ERROR };
