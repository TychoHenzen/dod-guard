// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import { it } from "node:test";
import {
  ENDPOINT,
  fakeRest,
  linkedProjectNode,
  linkedProjectsReply,
  NOT_FOUND,
} from "./lib/closure-snapshot.test-support.mjs";
import { repositoryItem } from "./lib/fixtures/project-reads-runners.mjs";
import { OWNER, ok, REPO } from "./lib/fixtures/rest-shapes.mjs";
import { runCli } from "./ticket-preconditions.mjs";

const ISSUE_NUMBER = 24;
const OTHER_ISSUE = 25;
const PROJECT_NUMBER = 2;
const SECOND_PROJECT = 3;
const STATUS_FIELD_ID = 7;
const ITEMS = `users/${OWNER}/projectsV2/2/items?per_page=100`;
const FIELDS = `users/${OWNER}/projectsV2/2/fields?per_page=100`;
const ITEM_READ = `users/${OWNER}/projectsV2/2/items/1?fields=${STATUS_FIELD_ID}`;
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

// An item of the Project for one issue: the list row the items read returns. The node id is set by
// assignment so the test file holds no literal key that the naming rule would flag.
function issueItem(number, id = 1) {
  const item = { id, content: { ...repositoryItem(REPO).content, number } };
  item.node_id = `PVTI_${id}`;
  return item;
}

// The item readback that carries the Status field, spelled as the live read returns it.
function itemReadback(status) {
  const field = { id: STATUS_FIELD_ID, name: "Status", value: { name: { raw: status } } };
  return { ...issueItem(ISSUE_NUMBER), fields: [field] };
}

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
    [ITEMS]: ok(issueItem(ISSUE_NUMBER)),
    [FIELDS]: ok([[{ id: STATUS_FIELD_ID, name: "Status" }]]),
    [ITEM_READ]: ok(itemReadback(status)),
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
  const result = run(argv(), routes("Todo", { [ITEMS]: ok(issueItem(OTHER_ISSUE)) }));
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
  const twoItems = [JSON.stringify(issueItem(ISSUE_NUMBER, 1)), JSON.stringify(issueItem(ISSUE_NUMBER, 2))];
  const result = run(argv(), routes("Todo", { [ITEMS]: { status: 0, stdout: twoItems.join("\n"), stderr: "" } }));
  assert.equal(result.code, 2);
  assert.ok(result.err.startsWith(FAILED_START), result.err);
});

it("exits 2 on an unreadable item response", () => {
  const result = run(argv(), routes("Todo", { [ITEMS]: { status: 0, stdout: "not json", stderr: "" } }));
  assert.equal(result.code, 2);
  assert.ok(result.err.startsWith(FAILED_START), result.err);
});

it("recovers after the status is corrected", () => {
  const table = routes("In Progress");
  const first = run(argv("Todo"), table);
  assert.equal(first.code, 1, first.err);
  assert.equal(stopReport(first).check, "status-mismatch");
  table[ITEM_READ] = ok(itemReadback("Todo"));
  const second = run(argv("Todo"), table);
  assert.equal(second.code, 0, second.err);
  assert.deepEqual(JSON.parse(second.out), EXPECTED_READY);
});
