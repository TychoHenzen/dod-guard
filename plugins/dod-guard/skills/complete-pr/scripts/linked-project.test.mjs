// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import test from "node:test";
import { isLinkedProjectRead } from "../../../lib/linked-project-read.mjs";
import * as support from "./lib/closure-snapshot.test-support.mjs";
import { runGh } from "./lib/gh-runner.mjs";
import { runCli } from "./linked-project.mjs";

const node = support.linkedProjectNode;
const reply = support.linkedProjectsReply;
const REPOSITORY = "TychoHenzen/dod-guard";
const REPOSITORY_ARG = `--repository=${REPOSITORY}`;
const WRITE_OR_MUTATION = /mutation|--method/;
const REST_PROJECTS_READ = /^(?:users|orgs|repos)\/.*projectsV2/;
const FAILED = /^linked-project failed: graphql repository\.projectsV2: /;
const USAGE_LINE = /^usage: linked-project\.mjs --repository=<owner\/name>/;
const GH_FAILED = /gh failed/;
const GH_502 = /gh failed: gh: HTTP 502/;
const RETURNED_ERRORS = /returned errors: Could not resolve/;
const NO_REPOSITORY = /named no repository/;
const MALFORMED_NODE = /malformed Project node/;
const INCOMPLETE = /is incomplete/;
const ALL_REPOSITORIES = "All Repositories";
const TITLED = { ...node(2), title: ALL_REPOSITORIES };
const OWNER = {
  ownerLogin: "TychoHenzen",
  ownerType: "User",
  basePath: "users/TychoHenzen",
};
const NOT_LOGGED_IN = "gh: To get started with GitHub CLI, please run: gh auth login";
const MISSING_REPOSITORY = "gh: Could not resolve to a Repository with the name 'TychoHenzen/missing'.";

// Answers the first call from reply and fails the test on any later call, so
// a fallback read cannot pass unnoticed. Exit codes are honored the way the
// shared runGh honors them.
function oneReadRunner(answer) {
  const calls = [];
  const runner = (args, acceptedExitCodes = [0]) => {
    calls.push(args);
    if (calls.length > 1) {
      throw new Error(`second call ${args.join(" ")}`);
    }
    return runGh(args, acceptedExitCodes, () => answer);
  };
  return { calls, runner };
}

function sink(text, key) {
  return {
    write: (chunk) => {
      text[key] += chunk;
    },
  };
}

function run(argv, answer) {
  const { calls, runner } = oneReadRunner(answer);
  const text = { out: "", err: "" };
  const stdout = sink(text, "out");
  const stderr = sink(text, "err");
  const code = runCli(argv, { runner, stdout, stderr });
  return { code, calls, ...text };
}

function assertOneDocumentedRead(calls) {
  assert.equal(calls.length, 1);
  assert.equal(isLinkedProjectRead(calls[0]), true, calls[0].join(" "));
  const text = calls[0].join(" ");
  assert.doesNotMatch(text, WRITE_OR_MUTATION);
  const restRead = calls[0].some((arg) => REST_PROJECTS_READ.test(arg));
  assert.ok(!restRead, "a REST projectsV2 read");
}

test("R1: one open link prints resolved, every field, exit 0", () => {
  const nodes = [TITLED, node(7, { closed: true })];
  const result = run([REPOSITORY_ARG], reply(nodes));
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), {
    outcome: "resolved",
    repository: REPOSITORY,
    project: { ...OWNER, number: 2, title: ALL_REPOSITORIES, id: "PVT_2" },
  });
  assertOneDocumentedRead(result.calls);
});

test("R2: zero open links, or only closed ones, print none and exit 1", () => {
  const none = { outcome: "none", repository: REPOSITORY, projects: [] };
  for (const nodes of [[], [node(3, { closed: true })]]) {
    const result = run([REPOSITORY_ARG], reply(nodes));
    assert.equal(result.code, 1, result.err);
    assert.deepEqual(JSON.parse(result.out), none);
    assertOneDocumentedRead(result.calls);
  }
});

test("R2: two links print several, with owner, number, title; exit 1", () => {
  const acme = { typename: "Organization", login: "acme" };
  const nodes = [TITLED, node(4, acme)];
  const result = run([REPOSITORY_ARG], reply(nodes));
  assert.equal(result.code, 1, result.err);
  assert.deepEqual(JSON.parse(result.out), {
    outcome: "several",
    repository: REPOSITORY,
    projects: [
      { ownerLogin: "TychoHenzen", number: 2, title: ALL_REPOSITORIES },
      { ownerLogin: "acme", number: 4, title: "Project 4" },
    ],
  });
  assertOneDocumentedRead(result.calls);
});

// gh failure, GraphQL errors, a null repository, a malformed node, and a
// further page are each a read that cannot be trusted.
test("R2: every untrusted read exits 2 with no output", () => {
  const graphqlErrors = {
    status: 1,
    stderr: MISSING_REPOSITORY,
    stdout: JSON.stringify({
      data: { repository: null },
      errors: [{ type: "NOT_FOUND", message: "Could not resolve" }],
    }),
  };
  const nullRepository = JSON.stringify({ data: { repository: null } });
  const ownerless = { ...node(2), owner: { __typename: "User" } };
  const cases = [
    [{ status: 4, stderr: NOT_LOGGED_IN, stdout: "" }, GH_FAILED],
    [{ status: 1, stderr: "gh: HTTP 502", stdout: "" }, GH_502],
    [graphqlErrors, RETURNED_ERRORS],
    [{ status: 0, stderr: "", stdout: nullRepository }, NO_REPOSITORY],
    [reply([ownerless]), MALFORMED_NODE],
    [reply([node(2)], { hasNextPage: true }), INCOMPLETE],
  ];
  for (const [answer, message] of cases) {
    const result = run([REPOSITORY_ARG], answer);
    assert.equal(result.code, 2, result.err);
    assert.equal(result.out, "");
    assert.match(result.err, FAILED);
    assert.match(result.err, message);
    assertOneDocumentedRead(result.calls);
  }
});

test("a missing, malformed, or extra flag is a usage error, no read", () => {
  for (const argv of [
    [],
    ["--repository=not-a-repository"],
    ["--repository"],
    [REPOSITORY],
    [REPOSITORY_ARG, "--fallback=membership"],
  ]) {
    const result = run(argv, reply([node(2)]));
    assert.equal(result.code, 2, argv.join(" "));
    assert.match(result.err, USAGE_LINE);
    assert.deepEqual(result.calls, []);
  }
});
