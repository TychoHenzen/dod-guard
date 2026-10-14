// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { isLinkedProjectRead } from "../../../lib/linked-project.mjs";
import { runGh } from "./lib/gh-runner.mjs";
import { runCli } from "./linked-project.mjs";

const REPOSITORY = "TychoHenzen/dod-guard";
const WRITE_OR_MUTATION = /mutation|--method/;
const REST_PROJECTS_READ = /^(?:users|orgs|repos)\/.*projectsV2/;
const FAILURE_PREFIX = /^linked-project failed: graphql repository\.projectsV2: /;
const USAGE_LINE = /^usage: linked-project\.mjs --repository=<owner\/name>/;
const GH_FAILED = /gh failed/;
const GH_502 = /gh failed: gh: HTTP 502/;
const RETURNED_ERRORS = /returned errors: Could not resolve/;
const NO_REPOSITORY = /named no repository/;
const MALFORMED_NODE = /malformed Project node/;
const INCOMPLETE = /is incomplete/;

// The node shape the live read returned for TychoHenzen/dod-guard on 2026-10-14.
function node(number, { closed = false, title = `Project ${number}`, typename = "User", login = "TychoHenzen" } = {}) {
  return { id: `PVT_${number}`, number, title, closed, owner: { __typename: typename, login } };
}

function graphqlReply(nodes, { hasNextPage = false } = {}) {
  return {
    status: 0,
    stderr: "",
    stdout: JSON.stringify({ data: { repository: { projectsV2: { nodes, pageInfo: { hasNextPage } } } } }),
  };
}

// Answers the first call from reply and fails the test on any later call, so a fallback read cannot
// pass unnoticed. Exit codes are honored the way the shared runGh honors them.
function oneReadRunner(reply) {
  const calls = [];
  const runner = (args, acceptedExitCodes = [0]) => {
    calls.push(args);
    if (calls.length > 1) {
      throw new Error(`second call ${args.join(" ")}`);
    }
    return runGh(args, acceptedExitCodes, () => reply);
  };
  return { calls, runner };
}

function run(argv, reply) {
  const { calls, runner } = oneReadRunner(reply);
  const text = { out: "", err: "" };
  const code = runCli(argv, {
    runner,
    stdout: {
      write: (chunk) => {
        text.out += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        text.err += chunk;
      },
    },
  });
  return { code, calls, ...text };
}

function assertOneDocumentedRead(calls) {
  assert.equal(calls.length, 1);
  assert.equal(isLinkedProjectRead(calls[0]), true, calls[0].join(" "));
  const text = calls[0].join(" ");
  assert.doesNotMatch(text, WRITE_OR_MUTATION);
  assert.ok(!calls[0].some((arg) => REST_PROJECTS_READ.test(arg)), "a REST projectsV2 read");
}

test("R1: one open linked Project prints resolved with every Project field and exits 0", () => {
  const result = run(
    [`--repository=${REPOSITORY}`],
    graphqlReply([node(2, { title: "All Repositories" }), node(7, { closed: true })]),
  );
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), {
    outcome: "resolved",
    repository: REPOSITORY,
    project: {
      ownerLogin: "TychoHenzen",
      ownerType: "User",
      basePath: "users/TychoHenzen",
      number: 2,
      title: "All Repositories",
      id: "PVT_2",
    },
  });
  assertOneDocumentedRead(result.calls);
});

test("R2: zero open links, or only closed ones, print none and exit 1", () => {
  for (const nodes of [[], [node(3, { closed: true })]]) {
    const result = run([`--repository=${REPOSITORY}`], graphqlReply(nodes));
    assert.equal(result.code, 1, result.err);
    assert.deepEqual(JSON.parse(result.out), { outcome: "none", repository: REPOSITORY, projects: [] });
    assertOneDocumentedRead(result.calls);
  }
});

test("R2: two open links print several with each owner, number, and title, and exit 1", () => {
  const result = run(
    [`--repository=${REPOSITORY}`],
    graphqlReply([node(2, { title: "All Repositories" }), node(4, { typename: "Organization", login: "acme" })]),
  );
  assert.equal(result.code, 1, result.err);
  assert.deepEqual(JSON.parse(result.out), {
    outcome: "several",
    repository: REPOSITORY,
    projects: [
      { ownerLogin: "TychoHenzen", number: 2, title: "All Repositories" },
      { ownerLogin: "acme", number: 4, title: "Project 4" },
    ],
  });
  assertOneDocumentedRead(result.calls);
});

test("R2: a gh failure, GraphQL errors, a null repository, a malformed node, or a further page exit 2", () => {
  const graphqlErrors = {
    status: 1,
    stderr: "gh: Could not resolve to a Repository with the name 'TychoHenzen/missing'.",
    stdout: JSON.stringify({
      data: { repository: null },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve" }],
    }),
  };
  const cases = [
    [{ status: 4, stderr: "gh: To get started with GitHub CLI, please run: gh auth login", stdout: "" }, GH_FAILED],
    [{ status: 1, stderr: "gh: HTTP 502", stdout: "" }, GH_502],
    [graphqlErrors, RETURNED_ERRORS],
    [{ status: 0, stderr: "", stdout: JSON.stringify({ data: { repository: null } }) }, NO_REPOSITORY],
    [graphqlReply([{ ...node(2), owner: { __typename: "User" } }]), MALFORMED_NODE],
    [graphqlReply([node(2)], { hasNextPage: true }), INCOMPLETE],
  ];
  for (const [reply, message] of cases) {
    const result = run([`--repository=${REPOSITORY}`], reply);
    assert.equal(result.code, 2, result.err);
    assert.equal(result.out, "");
    assert.match(result.err, FAILURE_PREFIX);
    assert.match(result.err, message);
    assertOneDocumentedRead(result.calls);
  }
});

test("a missing, malformed, or extra flag is a usage error with no read", () => {
  for (const argv of [
    [],
    ["--repository=not-a-repository"],
    ["--repository"],
    [REPOSITORY],
    [`--repository=${REPOSITORY}`, "--fallback=membership"],
  ]) {
    const result = run(argv, graphqlReply([node(2)]));
    assert.equal(result.code, 2, argv.join(" "));
    assert.match(result.err, USAGE_LINE);
    assert.deepEqual(result.calls, []);
  }
});
