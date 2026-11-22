import assert from "node:assert/strict";
import test from "node:test";
import { gate, parseError } from "./testing/handoff-proof-harness.mjs";

test("finalization exits 2 on an ordinary-path body and names every missing record", async () => {
  const ordinary = "## Summary\n\nA plain fix.\n\n## Acceptance criteria\n\n- [ ] AC-1 It works\n";
  const result = await gate("finalization", { body: ordinary, checkpoint: null });

  assert.deepEqual(
    result,
    parseError([
      "body has no ## Implementation notes section",
      "missing requirements record",
      "missing clarifications record",
      "missing implementation-plan record",
      "missing task-list record",
      "missing lens-ownership record",
      "missing acceptance-evidence record",
      "missing planned-acceptance-matrix record",
    ]),
  );
});

test("finalization exits 2 and names a matrix block that is missing, not JSON, or not an array", async () => {
  const section = (block) => `## Implementation handoff\n\n## Acceptance matrix\n\n${block}\n`;
  const cases = [
    [section("| id | status |\n| --- | --- |\n| R1 | pass |"), "acceptance matrix has no JSON block"],
    [section('```json\n[{"id": "R1",,}]\n```'), "acceptance matrix is not valid JSON"],
    [section('```json\n{"id": "R1"}\n```'), "acceptance matrix is not a JSON array"],
    ["## Implementation handoff\n", "handoff has no ## Acceptance matrix section"],
  ];

  for (const [handoff, message] of cases) {
    assert.deepEqual(await gate("finalization", { handoff, checkpoint: null }), parseError([message]), message);
  }
});
