// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: A Node test file.
import { it } from "node:test";
import { ENDPOINT, issueProjectItemNode, issueProjectItemsReply } from "./lib/closure-snapshot.test-support.mjs";
import {
  argv,
  EXPECTED_READY,
  PROJECT_NUMBER,
  routes,
  run,
  stopReport,
} from "./lib/ticket-preconditions.test-support.mjs";

it("exits 0 and prints the project and status", () => {
  const result = run(argv(), routes());
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), EXPECTED_READY);
});

it("exits 0 for an In Progress issue when the caller expects In Progress, the resume path", () => {
  const result = run(argv("In Progress"), routes("In Progress"));
  assert.equal(result.code, 0, result.err);
  assert.deepEqual(JSON.parse(result.out), { ...EXPECTED_READY, status: "In Progress" });
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
