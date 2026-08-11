import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScenarioBlock } from "./scenario-block.js";

// scenario-block.ts is type-only - inert at runtime. This pins the shape a
// leaf's title and intent come from.
test("ScenarioBlock carries a title and an intent", () => {
  const scenario: ScenarioBlock = { title: "Some scenario", intent: "the effect happens" };
  assert.equal(scenario.title, "Some scenario");
  assert.equal(scenario.intent, "the effect happens");
});
