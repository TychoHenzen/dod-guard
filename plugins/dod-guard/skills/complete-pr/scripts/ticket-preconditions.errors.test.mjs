// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import { it } from "node:test";
import {
  ENDPOINT,
  issueProjectItemNode,
  issueProjectItemsReply,
  SERVER_ERROR,
} from "./lib/closure-snapshot.test-support.mjs";
import { ok, REPO } from "./lib/fixtures/rest-shapes.mjs";
import {
  argv,
  FAILED_START,
  ISSUE_NUMBER,
  PROJECT_NUMBER,
  routes,
  run,
  SECOND_PROJECT,
  USAGE_START,
} from "./lib/ticket-preconditions.test-support.mjs";

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
