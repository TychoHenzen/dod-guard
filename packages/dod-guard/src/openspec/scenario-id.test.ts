import assert from "node:assert/strict";
import { test } from "node:test";
import { buildScenarioId } from "./scenario-id.js";

test("buildScenarioId joins group, capability, requirement and scenario", () => {
  const id = buildScenarioId("dod-guard", "coverage-gate", "cover reports a scenario's state", "unwired");
  assert.equal(id, "dod-guard/coverage-gate::cover reports a scenario's state||unwired");
});
