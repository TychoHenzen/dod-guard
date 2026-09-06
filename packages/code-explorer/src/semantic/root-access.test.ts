import assert from "node:assert/strict";
import { it } from "node:test";
import { adapter, root } from "../testing/root-access-test-support.js";
import { RootAccessGate } from "./root-access.js";

it("makes a changed or missing frozen root status-only and sto", async () => {
  const calls: string[] = [];
  const gate = new RootAccessGate(
    root(() => "unavailable"),
    [adapter(calls)],
  );
  assert.deepEqual(await gate.check(), {
    state: "project_root_unavailable",
    restart_required: true,
  });
  assert.deepEqual(calls, ["stop"]);
});
it("reports inaccessible root during the bounded recovery window", async () => {
  let now = 0;
  const gate = new RootAccessGate(
    root(() => "inaccessible"),
    [],
    () => now,
  );
  assert.deepEqual(await gate.check(), {
    state: "project_root_inaccessible",
    restart_required: false,
  });
  now = 29_999;
  assert.deepEqual(await gate.check(), {
    state: "project_root_inaccessible",
    restart_required: false,
  });
});
it("restarts selected backends after the same root recovers wi", async () => {
  let result: "ready" | "inaccessible" = "inaccessible";
  const calls: string[] = [];
  const gate = new RootAccessGate(
    root(() => result),
    [adapter(calls)],
    () => 5_000,
  );
  await gate.check();
  result = "ready";
  assert.deepEqual(await gate.check(), {
    state: "ready",
    restart_required: false,
  });
  assert.deepEqual(calls, ["stop", "start"]);
});
it("requires restart after thirty seconds of inaccessible root", async () => {
  let now = 0;
  const gate = new RootAccessGate(
    root(() => "inaccessible"),
    [],
    () => now,
  );
  await gate.check();
  now = 30_000;
  assert.deepEqual(await gate.check(), {
    state: "project_root_unavailable",
    restart_required: true,
  });
});
