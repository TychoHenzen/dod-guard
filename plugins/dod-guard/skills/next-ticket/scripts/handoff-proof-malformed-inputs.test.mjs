// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { gate, parseError } from "./testing/handoff-proof-harness.mjs";

const FENCE = "```";

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

test("finalization exits 2 and names a matrix block that is missing, not JSON, or not either matrix shape", async () => {
  const section = (block) => `## Implementation handoff\n\n## Acceptance matrix\n\n${block}\n`;
  const fenced = (json) => section(`${FENCE}json\n${json}\n${FENCE}`);
  const cases = [
    [section("| id | status |\n| --- | --- |\n| R1 | pass |"), "acceptance matrix has no JSON block"],
    [fenced('[{"id": "R1",,}]'), "acceptance matrix is not valid JSON"],
    [fenced('"R1"'), "acceptance matrix is not a JSON object of headSha and rows"],
    [
      fenced('{"id": "R1"}'),
      "acceptance matrix holds id, which is not headSha or rows; acceptance matrix needs a headSha; " +
        "acceptance matrix rows is not a JSON array",
    ],
    ["## Implementation handoff\n", "handoff has no ## Acceptance matrix section"],
  ];

  for (const [handoff, message] of cases) {
    assert.deepEqual(await gate("finalization", { handoff, checkpoint: null }), parseError([message]), message);
  }
});
