// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { test as it } from "node:test";
import { build, evidenceFor, PATHS, withRepo } from "./testing/handoff-carry-harness.mjs";

const LABEL = "row R1 entry carryForward";

it("refuses a malformed entry with the exact stderr line", () =>
  withRepo(async ({ root, baseHead: A, commentHead: B }) => {
    const cases = [
      ["a string", "x", `${LABEL} must be an object with fromHead and paths`],
      ["a missing fromHead", { paths: PATHS }, `${LABEL} needs a fromHead`],
      ["empty paths", { fromHead: A, paths: [] }, `${LABEL} needs a non-empty paths list`],
      ["an unknown key", { fromHead: A, paths: PATHS, extra: 1 }, `${LABEL} field extra is not fromHead or paths`],
    ];
    for (const [name, carry, line] of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: cases run in turn so each failure names its own case.
      const { code, out, err } = await build(evidenceFor(carry), { head: B, root });
      assert.equal(code, 1, name);
      assert.equal(out, "", name);
      assert.equal(err, `${line}\n`, name);
    }
  }));
