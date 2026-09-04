import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFreshnessController } from "./freshness.js";

type Reply = {
  state: string;
  data?: { generation: number; pending_generation?: number; workspace_state: string; readiness: string };
};

function harness(initialGeneration = 4) {
  let now = 0;
  let visible = true;
  const statuses: Reply[] = [];
  const refocuses: string[] = [];
  const refreshes: string[] = [];
  const controller = new BrowserFreshnessController({
    focus: { symbol_id: "symbol", generation: initialGeneration },
    now: () => now,
    visible: () => visible,
    status: async () =>
      statuses.shift() ?? {
        state: "ok",
        data: { generation: initialGeneration, workspace_state: "ready", readiness: "ready" },
      },
    refocus: async (symbol_id) => {
      refocuses.push(symbol_id);
      return { state: "ok", data: { generation: initialGeneration + 1, workspace_state: "ready", readiness: "ready" } };
    },
    refresh: async () => {
      refreshes.push("refresh");
      return (
        statuses.shift() ?? {
          state: "ok",
          data: { generation: initialGeneration, workspace_state: "ready", readiness: "ready" },
        }
      );
    },
  });
  return {
    controller,
    statuses,
    refocuses,
    refreshes,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    hide: () => {
      visible = false;
    },
  };
}

describe("browser freshness", () => {
  it("shows pending generation while retaining the current readable focus", async () => {
    const fixture = harness();
    fixture.statuses.push({
      state: "ok",
      data: { generation: 4, pending_generation: 5, workspace_state: "indexing", readiness: "ready" },
    });

    await fixture.controller.afterNavigation();

    assert.equal(fixture.controller.state().focus.generation, 4);
    assert.equal(fixture.controller.state().status?.pending_generation, 5);
    assert.equal(fixture.controller.state().navigationLocked, false);
  });
  it("locks follows when polling observes a newer published generation, and does not poll hidden tabs", async () => {
    const fixture = harness();
    fixture.statuses.push({ state: "ok", data: { generation: 5, workspace_state: "ready", readiness: "ready" } });
    fixture.advance(5_000);

    await fixture.controller.poll();

    assert.equal(fixture.controller.state().focus.stale, true);
    assert.equal(fixture.controller.state().navigationLocked, true);
    fixture.hide();
    fixture.advance(5_000);
    await fixture.controller.poll();
    assert.equal(fixture.statuses.length, 0);
  });
  it("refocuses the recorded identity once and unlocks the replacement view", async () => {
    const fixture = harness();
    fixture.statuses.push({ state: "ok", data: { generation: 5, workspace_state: "ready", readiness: "ready" } });
    await fixture.controller.afterNavigation();

    const result = await fixture.controller.refocus();

    assert.equal(result, true);
    assert.deepEqual(fixture.refocuses, ["symbol"]);
    assert.equal(fixture.controller.state().focus.generation, 5);
    assert.equal(fixture.controller.state().navigationLocked, false);
  });
  it("keeps the complete view and exposes a stable local refresh failure", async () => {
    const fixture = harness();
    fixture.statuses.push({
      state: "refresh_failed",
      data: { generation: 4, workspace_state: "degraded", readiness: "ready" },
    });
    const before = fixture.controller.state().focus;

    const result = await fixture.controller.refresh();

    assert.equal(result, false);
    assert.deepEqual(fixture.controller.state().focus, before);
    assert.equal(fixture.controller.state().refresh, "failed");
    assert.equal(fixture.controller.state().error, "refresh_failed");
    assert.equal(fixture.controller.state().status?.workspace_state, "degraded");
  });
});
