// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { readHandoffMatrix } from "../../../lib/handoff-matrix.mjs";
import { build, evidenceFor, PATHS, withRepo } from "./testing/handoff-carry-harness.mjs";
import { gate } from "./testing/handoff-proof-harness.mjs";

test("builds a carried row at the new head with the record", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const { code, out } = await build(evidenceFor({ fromHead: A, paths: PATHS }), { head: B, root });
    assert.equal(code, 0);
    const row = readHandoffMatrix(out).rows.find((item) => item.id === "R1");
    assert.equal(row.headSha, B);
    assert.deepEqual(row.carryForward, { baseHead: A, newHead: B, paths: PATHS, diffCheck: "whitespace-comment-only" });
  }));

test("post-push verifies the carried handoff at the new head", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const { out } = await build(evidenceFor({ fromHead: A, paths: PATHS }), { head: B, root });
    const result = await gate("post-push", { handoff: out, head: B });
    assert.equal(result.status, 0);
    assert.equal(result.json.outcome, "verified");
  }));

test("recovers after a refused carry by re-observing the row", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B, codeHead: C }) => {
    const refused = await build(evidenceFor({ fromHead: A, paths: PATHS }), { head: C, root });
    assert.equal(refused.code, 1);
    const { code, out } = await build(evidenceFor(), { head: B, root });
    assert.equal(code, 0);
    const result = await gate("post-push", { handoff: out, head: B });
    assert.equal(result.status, 0);
    assert.equal(result.json.outcome, "verified");
  }));
