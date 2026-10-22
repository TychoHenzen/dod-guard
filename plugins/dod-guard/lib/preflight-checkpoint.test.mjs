import assert from "node:assert/strict";
import test from "node:test";
import { checkpointRemainder, readPreflightCheckpoint } from "./preflight-checkpoint.mjs";

const HEAD = "abc1234";
const OTHER = "deadbee";
const row = (context, state, headSha = HEAD) => ({
  context,
  provider: "github-actions",
  workflow: "ci.yml",
  runId: 1,
  ref: "codex/982",
  headSha,
  state,
});
const section = (rows) =>
  `## Implementation handoff\n\n## Preflight checkpoint\n\n\`\`\`json\n${JSON.stringify(rows)}\n\`\`\`\n`;

test("reads no section as absent", () => {
  assert.deepEqual(readPreflightCheckpoint("## Implementation handoff\n\nNo record here.\n"), { absent: true });
});

test("refuses two sections", () => {
  const result = readPreflightCheckpoint(`${section([row("build-test", "present")])}\n${section([])}`);

  assert.equal(result.error, "handoff has more than one ## Preflight checkpoint section");
});

test("refuses a section with no json block", () => {
  const result = readPreflightCheckpoint("## Preflight checkpoint\n\nNo block.\n");

  assert.equal(result.error, "preflight checkpoint has no JSON block");
});

test("refuses a non-array block", () => {
  const result = readPreflightCheckpoint('## Preflight checkpoint\n\n```json\n{"context": "build-test"}\n```\n');

  assert.equal(result.error, "preflight checkpoint is not a JSON array");
});

test("reads the rows of the json block", () => {
  const rows = [row("build-test", "present"), row("quality-guard", "skipped")];

  assert.deepEqual(readPreflightCheckpoint(section(rows)), { rows });
});

test("passes present and skipped rows at the head", () => {
  const rows = [row("build-test", "present"), row("quality-guard", "skipped")];

  assert.deepEqual(checkpointRemainder(rows, HEAD), []);
});

test("names a failed context", () => {
  assert.deepEqual(checkpointRemainder([row("quality-guard", "failed")], HEAD), [
    "required context quality-guard is failed",
  ]);
});

test("names pending and unavailable contexts", () => {
  assert.deepEqual(checkpointRemainder([row("build-test", "pending")], HEAD), [
    "required context build-test is pending",
  ]);
  assert.deepEqual(checkpointRemainder([row("build-test", "unavailable")], HEAD), [
    "required context build-test is unavailable",
  ]);
});

test("names a duplicated context", () => {
  const rows = [row("build-test", "present"), row("build-test", "present")];

  assert.deepEqual(checkpointRemainder(rows, HEAD), ["required context build-test appears more than once"]);
});

test("names a row bound to another head, and a failed one names both lines", () => {
  assert.deepEqual(checkpointRemainder([row("build-test", "present", OTHER)], HEAD), [
    `required context build-test is bound to ${OTHER}, expected ${HEAD}`,
  ]);
  assert.deepEqual(checkpointRemainder([row("build-test", "failed", OTHER)], HEAD), [
    "required context build-test is failed",
    `required context build-test is bound to ${OTHER}, expected ${HEAD}`,
  ]);
});

test("reports a row with no head as bound to no head", () => {
  const { headSha, ...headless } = row("build-test", "present");

  assert.deepEqual(checkpointRemainder([headless], HEAD), [
    `required context build-test is bound to no head, expected ${HEAD}`,
  ]);
});

test("reports a malformed row", () => {
  const rows = [null, ["build-test"], { ...row("", "present") }, { ...row("build-test", "done") }];

  assert.deepEqual(checkpointRemainder(rows, HEAD), [
    "preflight checkpoint row 1 is malformed",
    "preflight checkpoint row 2 is malformed",
    "preflight checkpoint row 3 is malformed",
    "preflight checkpoint row 4 is malformed",
  ]);
});

test("reports an empty list", () => {
  assert.deepEqual(checkpointRemainder([], HEAD), ["preflight checkpoint has no required context row"]);
});
