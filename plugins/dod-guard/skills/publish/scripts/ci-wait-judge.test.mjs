import assert from "node:assert/strict";
import { test } from "node:test";
import { judge, newestPerName } from "./ci-wait.mjs";

test("judge reports passed when every check completed with success, skipped, or neutral", () => {
  const verdict = judge([
    { id: 1, name: "build-test", status: "completed", conclusion: "success" },
    { id: 2, name: "plugin-config", status: "completed", conclusion: "skipped" },
    { id: 3, name: "static-analysis", status: "completed", conclusion: "neutral" },
  ]);
  assert.equal(verdict.state, "passed");
  assert.deepEqual(verdict.failed, []);
});

test("judge reports failed and names each failed check even while another check is still running", () => {
  const verdict = judge([
    { id: 1, name: "build-test", status: "completed", conclusion: "failure" },
    { id: 2, name: "plugin-config", status: "in_progress", conclusion: null },
  ]);
  assert.equal(verdict.state, "failed");
  assert.deepEqual(verdict.failed, ["build-test"]);
});

test("judge reports pending when a check is queued or in progress", () => {
  const queued = judge([{ id: 1, name: "build-test", status: "queued", conclusion: null }]);
  const running = judge([{ id: 2, name: "build-test", status: "in_progress", conclusion: null }]);
  assert.equal(queued.state, "pending");
  assert.equal(running.state, "pending");
});

test('judge reports pending when a required check has not started and prints "not started" for it', () => {
  const verdict = judge(
    [{ id: 1, name: "build-test", status: "completed", conclusion: "success" }],
    ["build-test", "plugin-config"],
  );
  assert.equal(verdict.state, "pending");
  assert.ok(verdict.lines.includes("plugin-config: not started"));
});

test("judge reports pending when there are no check runs at all", () => {
  const verdict = judge([]);
  assert.equal(verdict.state, "pending");
});

test("newestPerName keeps the highest id on a re-run, so a stale failure yields to the newer success", () => {
  const rerun = [
    { id: 1, name: "build-test", status: "completed", conclusion: "failure" },
    { id: 5, name: "build-test", status: "completed", conclusion: "success" },
  ];
  const latest = newestPerName(rerun);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].id, 5);
  assert.equal(judge(rerun).state, "passed");
});
