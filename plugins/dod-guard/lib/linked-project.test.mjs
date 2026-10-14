// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import {
  classifyLinkedProjects,
  describeLinkedProjects,
  isLinkedProjectRead,
  LINKED_PROJECT_QUERY,
  LinkedProjectError,
  linkedProjectReadArgs,
  resolveLinkedProject,
} from "./linked-project.mjs";

const MUTATION = /mutation/i;
const QUERY_OPERATION = /^query\(/;
const REPOSITORY_PROJECTS = /repository\(owner: \$owner, name: \$name\) \{ projectsV2\(first: 100\)/;
const PAGE_INFO = /pageInfo \{ hasNextPage \}/;
const LOGIN_ERRORS = /returned errors: Field 'login'/;
const NO_REPOSITORY = /named no repository/;
const NOT_AN_OBJECT = /did not return a JSON object/;
const NO_CONNECTION = /projectsV2 nodes and pageInfo/;
const INCOMPLETE = /is incomplete/;
const MALFORMED_NODE = /malformed Project node/;
const GH_401 = /gh failed: gh: HTTP 401/;
const NOT_JSON = /did not return JSON/;
const SOMETHING_WRONG = /returned errors: Something went wrong/;
const GH_SPAWN = /gh failed: spawn/;
const OWNER_NAME = /owner\/name/;

// The node shape the live read returned for TychoHenzen/dod-guard on 2026-10-14.
function node(number, { closed = false, typename = "User", login = "TychoHenzen", title } = {}) {
  return {
    id: `PVT_${number}`,
    number,
    title: title ?? `Project ${number}`,
    closed,
    owner: { __typename: typename, login },
  };
}

function response(nodes, hasNextPage = false) {
  return { data: { repository: { projectsV2: { nodes, pageInfo: { hasNextPage } } } } };
}

function ok(value) {
  return { status: 0, stderr: "", stdout: JSON.stringify(value) };
}

// Records every call and answers each with the next queued reply, so a second call has no answer
// and fails the test.
function queuedRunner(...replies) {
  const calls = [];
  const runner = (args, acceptedExitCodes) => {
    calls.push({ args, acceptedExitCodes });
    if (replies.length === 0) {
      throw new Error(`unexpected call ${args.join(" ")}`);
    }
    return replies.shift();
  };
  return { calls, runner };
}

function assertLinkedProjectError(work, detail) {
  assert.throws(work, (error) => {
    assert.ok(error instanceof LinkedProjectError, String(error));
    assert.match(error.detail, detail);
    assert.ok(error.message.startsWith("graphql repository.projectsV2: "), error.message);
    return true;
  });
}

test("the query reads only repository.projectsV2 and asks for no mutation", () => {
  assert.doesNotMatch(LINKED_PROJECT_QUERY, MUTATION);
  assert.match(LINKED_PROJECT_QUERY, QUERY_OPERATION);
  assert.match(LINKED_PROJECT_QUERY, REPOSITORY_PROJECTS);
  assert.match(LINKED_PROJECT_QUERY, PAGE_INFO);
});

test("the documented read is recognized exactly, and any other GraphQL is not", () => {
  const args = linkedProjectReadArgs("TychoHenzen/dod-guard");
  assert.deepEqual(args, [
    "api",
    "graphql",
    "-f",
    `query=${LINKED_PROJECT_QUERY}`,
    "-f",
    "owner=TychoHenzen",
    "-f",
    "name=dod-guard",
  ]);
  assert.equal(isLinkedProjectRead(args), true);
  for (const other of [
    ["api", "graphql", "-f", "query=query { projectsV2 }"],
    ["api", "graphql", "-f", `query=${LINKED_PROJECT_QUERY} `, "-f", "owner=o", "-f", "name=r"],
    ["api", "graphql", "-F", `query=${LINKED_PROJECT_QUERY}`, "-f", "owner=o", "-f", "name=r"],
    ["api", "graphql", "-f", `query=mutation ${LINKED_PROJECT_QUERY}`, "-f", "owner=o", "-f", "name=r"],
    ["api", "graphql", "-f", `query=${LINKED_PROJECT_QUERY}`, "-f", "owner=o", "-f", "name=r", "--method"],
    ["api", "users/o/projectsV2?per_page=100"],
  ]) {
    assert.equal(isLinkedProjectRead(other), false, other.join(" "));
  }
});

test("one open link resolves, with a closed link alongside it ignored", () => {
  const result = classifyLinkedProjects(response([node(2, { title: "All Repositories" }), node(9, { closed: true })]));
  assert.deepEqual(result, {
    outcome: "resolved",
    projects: [
      {
        ownerLogin: "TychoHenzen",
        ownerType: "User",
        basePath: "users/TychoHenzen",
        number: 2,
        title: "All Repositories",
        id: "PVT_2",
      },
    ],
  });
});

test("an Organization owner reads under orgs/", () => {
  const [project] = classifyLinkedProjects(response([node(4, { typename: "Organization", login: "acme" })])).projects;
  assert.equal(project.basePath, "orgs/acme");
  assert.equal(project.ownerType, "Organization");
});

test("no open link is none, and two open links are several", () => {
  assert.deepEqual(classifyLinkedProjects(response([])), { outcome: "none", projects: [] });
  assert.equal(classifyLinkedProjects(response([node(3, { closed: true })])).outcome, "none");
  const several = classifyLinkedProjects(response([node(2), node(5)]));
  assert.equal(several.outcome, "several");
  assert.deepEqual(
    several.projects.map(({ number }) => number),
    [2, 5],
  );
});

test("describeLinkedProjects gives the stop text the closure snapshot keeps", () => {
  assert.equal(describeLinkedProjects([]), "none");
  assert.equal(describeLinkedProjects([{ number: 2 }, { number: 4 }]), "2 (#2, #4)");
});

test("an errors array, a null repository, a malformed node, or a further page is a contract error", () => {
  const cases = [
    [{ errors: [{ message: "Field 'login' doesn't exist" }] }, LOGIN_ERRORS],
    [{ data: { repository: null } }, NO_REPOSITORY],
    ["not an object", NOT_AN_OBJECT],
    [{ data: { repository: {} } }, NO_CONNECTION],
    [response([node(2)], true), INCOMPLETE],
    [response([null]), MALFORMED_NODE],
    [response([{ ...node(2), number: "2" }]), MALFORMED_NODE],
    [response([{ ...node(2), closed: "false" }]), MALFORMED_NODE],
    [response([{ ...node(2), owner: { login: "x" } }]), MALFORMED_NODE],
    [response([{ ...node(2), owner: { __typename: "User", login: " " } }]), MALFORMED_NODE],
    [response([node(2), { ...node(3, { closed: true }), id: "" }]), MALFORMED_NODE],
  ];
  for (const [value, detail] of cases) {
    assertLinkedProjectError(() => classifyLinkedProjects(value), detail);
  }
});

test("the resolver makes exactly one read-only GraphQL call and resolves", () => {
  const { calls, runner } = queuedRunner(ok(response([node(2)])));
  const result = resolveLinkedProject("TychoHenzen/dod-guard", runner);
  assert.equal(result.outcome, "resolved");
  assert.equal(result.repository, "TychoHenzen/dod-guard");
  assert.equal(calls.length, 1);
  assert.equal(isLinkedProjectRead(calls[0].args), true);
  assert.ok(!calls[0].args.includes("--method"));
});

test("every read failure throws after one call and no fallback read", () => {
  const graphqlErrors = {
    status: 1,
    stderr: "gh: Something went wrong",
    stdout: JSON.stringify({ errors: [{ message: "Something went wrong" }] }),
  };
  const cases = [
    [{ status: 1, stderr: "gh: HTTP 401: Bad credentials", stdout: "" }, GH_401],
    [{ status: 0, stderr: "", stdout: "{" }, NOT_JSON],
    [graphqlErrors, SOMETHING_WRONG],
    [ok({ data: { repository: null } }), NO_REPOSITORY],
    [ok(response([node(2)], true)), INCOMPLETE],
  ];
  for (const [reply, detail] of cases) {
    const { calls, runner } = queuedRunner(reply);
    assertLinkedProjectError(() => resolveLinkedProject("o/r", runner), detail);
    assert.equal(calls.length, 1);
  }
  const thrown = new Error("spawn gh ENOENT");
  assert.throws(
    () =>
      resolveLinkedProject("o/r", () => {
        throw thrown;
      }),
    (error) => error instanceof LinkedProjectError && error.cause === thrown && GH_SPAWN.test(error.detail),
  );
});

test("the resolver refuses a repository that is not owner/name before any read", () => {
  const { calls, runner } = queuedRunner();
  assertLinkedProjectError(() => resolveLinkedProject("not-a-repository", runner), OWNER_NAME);
  assert.equal(calls.length, 0);
});
