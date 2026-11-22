import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { SCRIPT, selectNext, snapshot } from "./select-next.test-support.mjs";

test("unlinked open pull requests are reported with a reason", async () => {
  const result = await selectNext({
    ...snapshot(),
    unlinkedPullRequests: [{ number: 31, headRef: "dependabot/npm/x" }, { number: 0 }],
  });
  assert.deepEqual(result.unlinkedPullRequests, [
    {
      number: 31,
      headRef: "dependabot/npm/x",
      reason: "open pull request #31 (head dependabot/npm/x) is linked to no Project issue",
    },
  ]);
});

test("reporting them leaves the selection unchanged", async () => {
  const plain = await selectNext(snapshot());
  const reported = await selectNext({ ...snapshot(), unlinkedPullRequests: [{ number: 31, headRef: "x" }] });
  assert.deepEqual(reported.selected, plain.selected);
  assert.deepEqual(reported.queueState, plain.queueState);
  assert.equal(reported.queueState, "ready");
});

test("an empty queue with an unlinked pull request is held, not exhausted", async () => {
  const empty = { ...snapshot(), items: [], issues: [] };
  const held = await selectNext({ ...empty, unlinkedPullRequests: [{ number: 3, headRef: "dependabot/x" }] });
  assert.equal(held.selected, null);
  assert.equal(held.queueState, "held");
  const exhausted = await selectNext(empty);
  assert.equal(exhausted.queueState, "exhausted");
});

test("a snapshot without the key reports an empty list", async () => {
  assert.deepEqual((await selectNext(snapshot())).unlinkedPullRequests, []);
});

test("the usage text documents the key", () => {
  const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unlinkedPullRequests/);
});
