// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: node:test is the repository's runner
import test from "node:test";
import { buildHandoff, gate, HEAD_904, ROWS_904 } from "./testing/handoff-proof-harness.mjs";

// The row under test is R1. HEAD_B is the head the tampered rows sit on, and the
// carry record's baseHead is a third commit so only the checked field is wrong.
const SHA_LENGTH = 40;
const HEAD_B = "b".repeat(SHA_LENGTH);
const BASE = "a".repeat(SHA_LENGTH);
const PATHS = ["plugins/dod-guard/lib/acceptance-matrix.mjs"];
const DIFF_CHECK = "whitespace-comment-only";
const ROW_UNDER_TEST = "R1";
const REJECTED = 1;

function withCarry(row, headSha, carryForward) {
  if (row.id !== ROW_UNDER_TEST) {
    return row;
  }
  return { ...row, headSha, carryForward };
}

function handoffWithCarry(carryForward, headSha = HEAD_B) {
  return buildHandoff(ROWS_904.map((row) => withCarry(row, headSha, carryForward)));
}

function wellFormed(overrides = {}) {
  return { baseHead: BASE, newHead: HEAD_B, paths: PATHS, diffCheck: DIFF_CHECK, ...overrides };
}

function tamperedPostPush(carryForward) {
  return gate("post-push", { handoff: handoffWithCarry(carryForward), head: HEAD_B });
}

test("rejects a carry record whose newHead is not the row head", async () => {
  const { status, json } = await tamperedPostPush(wellFormed({ newHead: HEAD_904 }));
  assert.equal(status, REJECTED);
  assert.ok(json.remainder.some((entry) => entry.includes("carryForward newHead is not the row head")));
});

test("rejects a carry record whose baseHead equals the row head", async () => {
  const { status, json } = await tamperedPostPush(wellFormed({ baseHead: HEAD_B }));
  assert.equal(status, REJECTED);
  assert.ok(json.remainder.some((entry) => entry.includes("carryForward baseHead equals the row head")));
});

test("rejects a carry record with an empty paths list", async () => {
  const { status, json } = await tamperedPostPush(wellFormed({ paths: [] }));
  assert.equal(status, REJECTED);
  assert.ok(json.remainder.some((entry) => entry.includes("carryForward needs a non-empty paths list")));
});

test("rejects a carry record with a wrong diffCheck", async () => {
  const { status, json } = await tamperedPostPush(wellFormed({ diffCheck: "full" }));
  assert.equal(status, REJECTED);
  assert.ok(json.remainder.some((entry) => entry.includes("carryForward diffCheck is not whitespace-comment-only")));
});

test("rejects a carry record that is not an object", async () => {
  const { status, json } = await tamperedPostPush("whitespace-comment-only");
  assert.equal(status, REJECTED);
  assert.ok(json.remainder.some((entry) => entry.includes("carryForward is not an object")));
});

test("accepts a well formed carry record", async () => {
  const handoff = handoffWithCarry(wellFormed({ newHead: HEAD_904 }), HEAD_904);
  assert.deepEqual(await gate("post-push", { handoff }), { status: 0, json: { outcome: "verified", remainder: [] } });
});
