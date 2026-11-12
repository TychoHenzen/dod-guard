// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test as it } from "node:test";
import { build, evidenceFor, PATHS, TEMPLATE_PATHS, withRepo } from "./testing/handoff-carry-harness.mjs";
import { gate } from "./testing/handoff-proof-harness.mjs";

const CODE_CHANGED = "changed code or has no comment-only reading";

async function refusal(carry, ctx) {
  const { code, out, err } = await build(evidenceFor(carry), ctx);
  return { code, out, err };
}

// The stderr contract: exit 1, nothing on stdout, and one line naming the row, base head and reason.
function refusedWith(carry, reason) {
  return { code: 1, out: "", err: `row R1 cannot carry forward from ${carry.fromHead}: ${reason}\n` };
}

it("refuses a code change", () =>
  withRepo(async ({ root, baseHead: A, codeHead: C }) => {
    const carry = { fromHead: A, paths: PATHS };
    assert.deepEqual(await refusal(carry, { head: C, root }), refusedWith(carry, `src/a.mjs ${CODE_CHANGED}`));
  }));

it("refuses a trailing comment added to a code line", () =>
  withRepo(async ({ root, baseHead: A, trailingHead: D }) => {
    const carry = { fromHead: A, paths: PATHS };
    assert.deepEqual(await refusal(carry, { head: D, root }), refusedWith(carry, `src/a.mjs ${CODE_CHANGED}`));
  }));

it("refuses a comment edit inside a template literal", () =>
  withRepo(async ({ root, baseHead: A, templateHead: E }) => {
    const carry = { fromHead: A, paths: TEMPLATE_PATHS };
    assert.deepEqual(await refusal(carry, { head: E, root }), refusedWith(carry, `src/t.mjs ${CODE_CHANGED}`));
  }));

it("refuses a fromHead equal to the new head", () =>
  withRepo(async ({ root, commentHead: B }) => {
    const carry = { fromHead: B, paths: PATHS };
    assert.deepEqual(await refusal(carry, { head: B, root }), refusedWith(carry, "fromHead equals the new head"));
  }));

it("refuses a carry without --root", () =>
  withRepo(async ({ baseHead: A, commentHead: B }) => {
    const carry = { fromHead: A, paths: PATHS };
    assert.deepEqual(await refusal(carry, { head: B }), refusedWith(carry, "no checkout was given, pass --root"));
  }));

it("refuses a .md path", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const carry = { fromHead: A, paths: ["README.md"] };
    assert.deepEqual(await refusal(carry, { head: B, root }), refusedWith(carry, `README.md ${CODE_CHANGED}`));
  }));

it("refuses a path missing at the base head", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const carry = { fromHead: A, paths: ["src/gone.mjs"] };
    assert.deepEqual(await refusal(carry, { head: B, root }), refusedWith(carry, `src/gone.mjs is missing at ${A}`));
  }));

it("refuses a non-sha fromHead", () =>
  withRepo(async ({ root, commentHead: B }) => {
    const carry = { fromHead: "not-a-sha", paths: PATHS };
    assert.deepEqual(await refusal(carry, { head: B, root }), refusedWith(carry, "fromHead is not a commit sha"));
  }));

it("leaves a row at the old head stale", () =>
  withRepo(async ({ baseHead: A, commentHead: B }) => {
    const { out } = await build(evidenceFor(), { head: A });
    const result = await gate("post-push", { handoff: out, head: B });
    const text = JSON.stringify(result.json);
    assert.equal(result.status, 1);
    assert.ok(text.includes("is bound to head") && text.includes("expected"), text);
  }));
