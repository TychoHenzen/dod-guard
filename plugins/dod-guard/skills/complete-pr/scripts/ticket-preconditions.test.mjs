// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import { it } from "node:test";
import {
  ENDPOINT,
  fakeRest,
  issueProjectItemNode,
  issueProjectItemsReply,
  linkedProjectNode,
  linkedProjectsReply,
  NOT_FOUND,
  SERVER_ERROR,
} from "./lib/closure-snapshot.test-support.mjs";
import { OWNER, ok, REPO } from "./lib/fixtures/rest-shapes.mjs";
import { runCli } from "./ticket-preconditions.mjs";

const ISSUE_NUMBER = 24;
const PROJECT_NUMBER = 2;
const SECOND_PROJECT = 3;
const ISSUE = `repos/${REPO}/issues/${ISSUE_NUMBER}`;
const USAGE_START = "usage: ticket-preconditions.mjs";
const FAILED_START = "ticket-preconditions failed:";
const EXPECTED_READY = {
  outcome: "ready",
  repository: REPO,
  issue: ISSUE_NUMBER,
  project: { ownerLogin: OWNER, number: PROJECT_NUMBER, title: `Project ${PROJECT_NUMBER}` },
  status: "Todo",
};

// A REST issue record that names a pull request. The key is set by assignment for the naming rule.
function pullRequestReply() {
  const reply = { number: ISSUE_NUMBER };
  reply.pull_request = {};
  return ok(reply);
}

// The route table for a ready issue. fakeRest reads it on every call, so a test may change an entry
// between runs.
function routes(status = "Todo", overrides = {}) {
  return {
    [ENDPOINT.linkedProjects]: linkedProjectsReply([linkedProjectNode(PROJECT_NUMBER)]),
    [ISSUE]: ok({ number: ISSUE_NUMBER, state: "open" }),
    [ENDPOINT.issueProjectItems]: issueProjectItemsReply([issueProjectItemNode(PROJECT_NUMBER, status)]),
    ...overrides,
  };
}

function argv(status = "Todo") {
  return [`--repository=${REPO}`, `--issue=${ISSUE_NUMBER}`, `--expect-status=${status}`];
}

function sink(text, key) {
  return {
    write: (chunk) => {
      text[key] += chunk;
    },
  };
}

function run(args, table) {
  const { calls, runner } = fakeRest(table);
  const text = { out: "", err: "" };
  const code = runCli(args, { runner, stdout: sink(text, "out"), stderr: sink(text, "err") });
  return { code, calls, out: text.out, err: text.err };
}

// The parsed stop JSON that a stop run writes to stdout.
function stopReport(result) {
  return JSON.parse(result.out);
}

it("exits 0 and prints the project and status", () => {
  const result = run(argv(), routes());
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), EXPECTED_READY);
});

it("exits 1 with linked-project-none when the repository has no open linked Project", () => {
  const result = run(argv(), routes("Todo", { [ENDPOINT.linkedProjects]: linkedProjectsReply([]) }));
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, "linked-project-none");
});

it("exits 1 with linked-project-several when the repository links two open Projects", () => {
  const nodes = [linkedProjectNode(PROJECT_NUMBER), linkedProjectNode(SECOND_PROJECT)];
  const result = run(argv(), routes("Todo", { [ENDPOINT.linkedProjects]: linkedProjectsReply(nodes) }));
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, "linked-project-several");
});

it("exits 1 with issue-not-in-repository when the issue does not exist", () => {
  const result = run(argv(), routes("Todo", { [ISSUE]: NOT_FOUND }));
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, "issue-not-in-repository");
});

it("exits 1 with issue-not-in-repository when the number is a pull request", () => {
  const result = run(argv(), routes("Todo", { [ISSUE]: pullRequestReply() }));
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, "issue-not-in-repository");
});

it("exits 1 with issue-not-in-project when the Project holds no item for the issue", () => {
  const result = run(
    argv(),
    routes("Todo", {
      [ENDPOINT.issueProjectItems]: issueProjectItemsReply([issueProjectItemNode(SECOND_PROJECT, "Todo")]),
    }),
  );
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, "issue-not-in-project");
});

it("exits 1 with status-mismatch when the Status is not the expected one", () => {
  const result = run(argv("Todo"), routes("In Progress"));
  assert.equal(result.code, 1, result.err);
  const report = stopReport(result);
  assert.equal(report.check, "status-mismatch");
  assert.equal(report.detail, "status is In Progress, expected Todo");
});

it("exits 1 with status-blank when the item has no Status value", () => {
  const result = run(argv(), routes(null));
  assert.equal(result.code, 1, result.err);
  assert.equal(stopReport(result).check, "status-blank");
});

it("exits 2 on a usage error and never reads", () => {
  const usage = [
    [`--repository=${REPO}`, "--expect-status=Todo"],
    [`--repository=${REPO}`, "--issue=abc", "--expect-status=Todo"],
    [...argv(), "--extra=1"],
    [`--repository=${REPO}`, `--issue=${ISSUE_NUMBER}`, "--expect-status"],
  ];
  for (const args of usage) {
    const result = run(args, routes());
    assert.equal(result.code, 2);
    assert.ok(result.err.startsWith(USAGE_START), result.err);
    assert.equal(result.calls.length, 0);
  }
});

it("exits 2 when the Project holds two items for the issue", () => {
  const nodes = [issueProjectItemNode(PROJECT_NUMBER, "Todo"), issueProjectItemNode(PROJECT_NUMBER, "Done")];
  const result = run(argv(), routes("Todo", { [ENDPOINT.issueProjectItems]: issueProjectItemsReply(nodes) }));
  assert.equal(result.code, 2);
  assert.ok(result.err.startsWith(FAILED_START), result.err);
});

it("exits 2, never issue-not-in-project, when the item relation is incomplete", () => {
  const reply = issueProjectItemsReply([issueProjectItemNode(SECOND_PROJECT, "Todo")], { hasNextPage: true });
  const result = run(argv(), routes("Todo", { [ENDPOINT.issueProjectItems]: reply }));
  assert.equal(result.code, 2);
  assert.equal(result.out, "");
  assert.ok(result.err.startsWith(FAILED_START), result.err);
});

it("exits 2 on a failed, errored, or unreadable item read", () => {
  const replies = [
    SERVER_ERROR,
    ok({ data: null, errors: [{ message: "boom" }] }),
    ok({ data: { repository: { issue: null } } }),
    { status: 0, stdout: "not json", stderr: "" },
  ];
  for (const reply of replies) {
    const result = run(argv(), routes("Todo", { [ENDPOINT.issueProjectItems]: reply }));
    assert.equal(result.code, 2);
    assert.equal(result.out, "");
    assert.ok(result.err.startsWith(FAILED_START), result.err);
  }
});

it("gives the same result on every repeated run for the same issue", () => {
  const table = routes();
  const results = Array.from({ length: 5 }, () => run(argv(), table));
  assert.deepEqual(
    results.map((result) => result.code),
    [0, 0, 0, 0, 0],
  );
  assert.equal(new Set(results.map((result) => result.out)).size, 1);
});

it("recovers after the status is corrected", () => {
  const table = routes("In Progress");
  const first = run(argv("Todo"), table);
  assert.equal(first.code, 1, first.err);
  assert.equal(stopReport(first).check, "status-mismatch");
  table[ENDPOINT.issueProjectItems] = issueProjectItemsReply([issueProjectItemNode(PROJECT_NUMBER, "Todo")]);
  const second = run(argv("Todo"), table);
  assert.equal(second.code, 0, second.err);
  assert.deepEqual(JSON.parse(second.out), EXPECTED_READY);
});
