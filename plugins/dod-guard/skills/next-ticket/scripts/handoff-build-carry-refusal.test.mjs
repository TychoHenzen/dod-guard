// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test } from "node:test";
import { build, evidenceFor, PATHS, withRepo } from "./testing/handoff-carry-harness.mjs";
import { gate } from "./testing/handoff-proof-harness.mjs";

test("refuses a code change and prints nothing", () =>
  withRepo(async ({ root, baseHead: A, codeHead: C }) => {
    const { code, out, err } = await build(evidenceFor({ fromHead: A, paths: PATHS }), { head: C, root });
    assert.equal(code, 1);
    assert.ok(err.includes("cannot carry forward from"), err);
    assert.equal(out, "");
  }));

test("leaves a row at the old head stale", () =>
  withRepo(async ({ baseHead: A, commentHead: B }) => {
    const { out } = await build(evidenceFor(), { head: A });
    const result = await gate("post-push", { handoff: out, head: B });
    const text = JSON.stringify(result.json);
    assert.equal(result.status, 1);
    assert.ok(text.includes("is bound to head") && text.includes("expected"), text);
  }));

test("refuses a carry without --root", () =>
  withRepo(async ({ baseHead: A, commentHead: B }) => {
    const { code, out, err } = await build(evidenceFor({ fromHead: A, paths: PATHS }), { head: B });
    assert.equal(code, 1);
    assert.ok(err.includes("no checkout was given, pass --root"), err);
    assert.equal(out, "");
  }));

test("refuses a malformed entry", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const cases = [
      ["a string", "x", "must be an object with fromHead and paths"],
      ["a missing fromHead", { paths: PATHS }, "needs a fromHead"],
      ["empty paths", { fromHead: A, paths: [] }, "needs a non-empty paths list"],
      ["an unknown key", { fromHead: A, paths: PATHS, extra: 1 }, "field extra is not fromHead or paths"],
    ];
    for (const [name, carry, message] of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: cases run in turn so each failure names its own case.
      const { code, err } = await build(evidenceFor(carry), { head: B, root });
      assert.equal(code, 1, name);
      assert.ok(err.includes(message), `${name}: ${err}`);
    }
  }));

test("refuses a .md path, a missing path and a non-sha fromHead", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const cases = [
      [{ fromHead: A, paths: ["README.md"] }, "changed code or has no comment-only reading"],
      [{ fromHead: A, paths: ["src/gone.mjs"] }, "is missing at"],
      [{ fromHead: "not-a-sha", paths: PATHS }, "not a commit sha"],
    ];
    for (const [carry, reason] of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: cases run in turn so each failure names its own case.
      const { code, err } = await build(evidenceFor(carry), { head: B, root });
      assert.equal(code, 1, reason);
      assert.ok(err.includes(reason), err);
    }
  }));
