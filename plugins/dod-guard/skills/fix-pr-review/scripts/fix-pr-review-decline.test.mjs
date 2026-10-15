// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { assertInOrder, sectionBetween, skill } from "./lib/contract-text.mjs";

const declineSection = () => sectionBetween("## Decline non-actionable findings", "## Report");
const updateSection = () => sectionBetween("## Update proven findings", "## Decline non-actionable findings");

test("documents the decline path for non-actionable findings", () => {
  const decline = declineSection();

  assert.match(decline, /`unsupported`, `already-fixed`, or `stale`/);
  assert.match(decline, /whose thread is still open/);
  assert.match(decline, /ask for no per-PR confirmation/);
  assert.match(decline, /already resolved is\s+a no-op with no write/);
  assertInOrder(decline, [/Reply through the same endpoint/, /`in_reply_to`/, /exactly one `resolveReviewThread`/]);
  assert.match(decline, /`node\(id: \$threadId\)`/);
  assert.match(decline, /classification, the exact evidence/);
  assert.doesNotMatch(skill, /only findings proven fixed/);
  assert.doesNotMatch(skill, /Keep stale, unsupported,\s+and unresolved findings visible/);
});

test("pins decline head handling and the stops", () => {
  const decline = declineSection();

  assert.match(decline, /Read the PR head once before\s+the first reply and the resolve/);
  assert.match(decline, /expected and\s+observed SHAs, post no reply, and make no resolution claim/);
  assert.match(decline, /set the\s+reply's `commit_id` to that revalidated head/);
  assert.match(decline, /three-ref convergence wait/);
  assert.match(decline, /a mismatched head, or an unresolved readback stops the workflow/);
  assert.match(decline, /no resolution claim, and the thread unchanged/);
});

test("pins the report fields", () => {
  const report = skill.slice(skill.indexOf("## Report"));

  assert.match(report, /declined finding IDs each with its classification\s+and evidence/);
  assert.match(report, /resolved thread IDs/);
});

test("a rerun resolves a decline-replied open thread without a second reply", () => {
  const decline = declineSection();
  const rerun = decline.slice(decline.indexOf("A rerun after a failed resolve"));

  assert.notEqual(rerun, "");
  assert.match(rerun, /reads the thread back first and never posts a\s+duplicate reply/);
  assert.match(rerun, /A resolved thread is a no-op with no write/);
  assert.match(rerun, /already holds a decline reply from\s+this skill/);
  assert.match(rerun, /Post no second reply and go\s+straight to the read back and resolve steps/);
  assert.match(rerun, /head-handling stop above\s+does not apply to that reply/);
  assert.match(rerun, /Accept its `commit_id` when it is an ancestor\s+of the current head/);
  assert.match(rerun, /even if the head moved between runs/);
  assert.match(rerun, /re-verify the evidence against the current head/);
});

test("a mixed thread gets one reply and one resolve from the decline procedure", () => {
  const decline = declineSection();

  assert.match(decline, /one reply that lists the fixed items with\s+the commit/);
  assert.match(decline, /gives a reason for each declined\s+item/);
  assert.match(decline, /owns the one reply and the one resolve of a thread/);
  assert.match(decline, /holds both a fixed and a declined item/);
  assert.match(decline, /fix path under "Update proven\s+findings" posts no reply and no resolve/);
  assert.match(updateSection(), /Skip any thread that also holds a declined item/);
  assert.match(updateSection(), /owns its single reply and resolve/);
});
