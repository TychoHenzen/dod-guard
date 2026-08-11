import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRequirementBlocks } from "./requirements.js";

test("extractRequirementBlocks joins two separate THEN bullets in one scenario with a space", () => {
  // No real scenario here carries two THEN bullets; pins the join rule directly.
  const content = [
    "### Requirement: Two THEN bullets",
    "",
    "#### Scenario: Outcome has two parts",
    "- **WHEN** the trigger happens",
    "- **THEN** the first effect happens",
    "- **THEN** the second effect happens",
    "",
  ].join("\n");

  const [block] = extractRequirementBlocks(content);
  assert.equal(block.scenarios.length, 1);
  assert.equal(block.scenarios[0].intent, "the first effect happens the second effect happens");
});
