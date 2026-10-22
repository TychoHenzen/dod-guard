// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { it } from "node:test";
import { ENDPOINT, fakeRest, issueProjectItemNode, issueProjectItemsReply } from "./closure-snapshot.test-support.mjs";
import { OWNER, ok } from "./fixtures/rest-shapes.mjs";
import { isIssueProjectItemsRead, issueProjectItemsReadArgs } from "./issue-project-items.mjs";
import { readIssueStatusInProject } from "./project-reads.mjs";

const PROJECT_NUMBER = 2;
const OTHER_PROJECT = 3;
const NO_STATUS_PROJECT = 9;
const ONE_CALL = 1;
const LAST_ARG = 9;
const BEFORE_LAST_FLAG = 8;
const QUERY_AT = 3;
const PROJECT = { ownerLogin: OWNER, number: PROJECT_NUMBER };
const REPOSITORY = `${OWNER}/repo`;
const ISSUE_NUMBER = 24;

function read(reply) {
  const { calls, runner } = fakeRest({ [ENDPOINT.issueProjectItems]: reply });
  return { calls, read: () => readIssueStatusInProject(PROJECT, REPOSITORY, ISSUE_NUMBER, runner) };
}

it("reads the Status of the issue's item in the given Project with one GraphQL call", () => {
  const { calls, read: run } = read(issueProjectItemsReply([issueProjectItemNode(PROJECT_NUMBER, "Done")]));

  assert.equal(run(), "Done");
  assert.equal(calls.length, ONE_CALL);
  assert.deepEqual(calls[0], issueProjectItemsReadArgs(REPOSITORY, ISSUE_NUMBER));
});

it("gives the same answer on every repeated read", () => {
  const { read: run } = read(issueProjectItemsReply([issueProjectItemNode(PROJECT_NUMBER, "Todo")]));

  assert.deepEqual([run(), run(), run(), run()], ["Todo", "Todo", "Todo", "Todo"]);
});

it("ignores the issue's items in other Projects, whatever their Status", () => {
  const nodes = [
    issueProjectItemNode(OTHER_PROJECT, "Done"),
    issueProjectItemNode(PROJECT_NUMBER, "Todo", { login: "someone-else" }),
    issueProjectItemNode(NO_STATUS_PROJECT, null),
    issueProjectItemNode(PROJECT_NUMBER, "In Progress"),
  ];

  assert.equal(read(issueProjectItemsReply(nodes)).read(), "In Progress");
});

it("returns null only when the complete relation holds no item in the Project", () => {
  assert.equal(read(issueProjectItemsReply([issueProjectItemNode(OTHER_PROJECT, "Done")])).read(), null);
  assert.equal(read(issueProjectItemsReply([])).read(), null);
});

it("stops when the relation is incomplete, instead of reporting the issue absent", () => {
  const reply = issueProjectItemsReply([issueProjectItemNode(OTHER_PROJECT, "Done")], { hasNextPage: true });

  assert.throws(() => read(reply).read(), { code: "github_response_shape" });
});

it("stops on a null issue, a missing relation, and a malformed item", () => {
  const replies = [
    ok({ data: { repository: { issue: null } } }),
    ok({ data: { repository: null } }),
    ok({ data: {} }),
    ok({
      data: {
        repository: { issue: { projectItems: { nodes: [{ project: null }], pageInfo: { hasNextPage: false } } } },
      },
    }),
    issueProjectItemsReply([
      { ...issueProjectItemNode(PROJECT_NUMBER, "Todo"), project: { number: 2, closed: false, owner: {} } },
    ]),
  ];

  for (const reply of replies) {
    assert.throws(() => read(reply).read(), { code: "github_response_shape" });
  }
});

it("stops on a failed gh call, GraphQL errors, and a body that is not JSON", () => {
  const failures = [
    { status: 1, stdout: "", stderr: "gh: Something went wrong (HTTP 502)" },
    ok({ data: null, errors: [{ message: "boom" }] }),
    { status: 0, stdout: "not json", stderr: "" },
    { status: 0, stdout: "", stderr: "" },
  ];

  for (const reply of failures) {
    assert.throws(() => read(reply).read());
  }
});

it("stops when the Project holds two items for the issue or the item has no Status", () => {
  const two = issueProjectItemsReply([
    issueProjectItemNode(PROJECT_NUMBER, "Todo"),
    issueProjectItemNode(PROJECT_NUMBER, "Done"),
  ]);
  const blank = issueProjectItemsReply([issueProjectItemNode(PROJECT_NUMBER, null)]);

  assert.throws(() => read(two).read(), { code: "github_response_shape" });
  assert.throws(() => read(blank).read(), { code: "github_response_shape" });
});

it("recognizes exactly the documented read", () => {
  const args = issueProjectItemsReadArgs(REPOSITORY, ISSUE_NUMBER);
  const withQuery = (query) => args.with(QUERY_AT, `query=${query}`);

  assert.equal(isIssueProjectItemsRead(args), true);
  assert.equal(isIssueProjectItemsRead(withQuery("query { viewer { login } }")), false);
  assert.equal(isIssueProjectItemsRead(args.slice(0, -QUERY_AT + 1)), false);
  assert.equal(isIssueProjectItemsRead([...args.slice(0, -1), "number=abc"]), false);
  assert.equal(isIssueProjectItemsRead([...args.slice(0, BEFORE_LAST_FLAG), "-f", args[LAST_ARG]]), false);
});
