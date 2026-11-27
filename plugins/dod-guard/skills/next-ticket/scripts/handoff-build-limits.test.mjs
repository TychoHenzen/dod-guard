// handoff-build.mjs refuses any part of the handoff over its limit in lib/handoff-limits.mjs,
// names it, and prints nothing, so a long handoff is rewritten shorter and never cut off.
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { HANDOFF_LIMITS } from "../../../lib/handoff-limits.mjs";
import { build, evidenceFor } from "./testing/handoff-build-harness.mjs";
import { BODY_TEXT, checkpointRows, withCheckpoint } from "./testing/handoff-proof-harness.mjs";

const LONG_TASK = /task T1 line is \d+ characters, over the 280-character limit; write it shorter, do not cut it off/;
const LONG_ROW = /matrix row R1 is \d+ characters, over the 280-character limit/;
const LONG_CHECKPOINT = /the carried ## Preflight checkpoint is \d+ characters, over the 3000-character limit/;
const SHA_LENGTH = 40;
const OLD_HEAD = "a".repeat(SHA_LENGTH);

test("refuses a task line or a row over its limit and cuts nothing", async () => {
  const evidence = evidenceFor();
  evidence.tasks[0].result = "r".repeat(HANDOFF_LIMITS.taskLine);
  evidence.rows.R1.observed = "o".repeat(HANDOFF_LIMITS.rowLine);
  const { code, out, err } = await build(evidence);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(err, LONG_TASK);
  assert.match(err, LONG_ROW);
});

test("refuses a body with an id longer than the handoff takes", async () => {
  const body = BODY_TEXT.replace('{"id": "R10",', '{"id": "R10-gates-and-more",');
  assert.notEqual(body, BODY_TEXT);
  const evidence = evidenceFor();
  const { R10: renamed, ...rows } = evidence.rows;
  evidence.rows = { ...rows, "R10-gates-and-more": renamed };
  const { code, err } = await build(evidence, body);
  assert.equal(code, 1);
  assert.ok(err.includes("planned row id R10-gates-and-more is longer than 16 characters"), err);
});

test("refuses a carried checkpoint over its limit and builds nothing", async () => {
  const previous = withCheckpoint("## Implementation handoff\n\n- old bullet\n", checkpointRows(OLD_HEAD));
  const long = previous.replace(
    "## Preflight checkpoint\n",
    `## Preflight checkpoint\n\n${"z".repeat(HANDOFF_LIMITS.checkpoint)}\n`,
  );
  const { code, out, err } = await build(evidenceFor(), BODY_TEXT, long);
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.match(err, LONG_CHECKPOINT);
});
