import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequirementBlock } from "./requirement-block.js";

// requirement-block.ts is type-only - inert at runtime. This pins the shape
// requirements.ts produces and convert.ts consumes.
test("RequirementBlock carries a title and a scenarios array", () => {
  const block: RequirementBlock = {
    title: "Some requirement",
    scenarios: [{ title: "Some scenario", intent: "the thing happens" }],
  };
  assert.equal(block.title, "Some requirement");
  assert.equal(block.scenarios.length, 1);
  assert.equal(block.scenarios[0].intent, "the thing happens");
});
