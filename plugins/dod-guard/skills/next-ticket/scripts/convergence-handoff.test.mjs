import assert from "node:assert/strict";
import test from "node:test";
import { renderConvergence } from "./structured-workflow-proof.mjs";

test("a verified convergence cannot render without its handoff", () => {
  assert.throws(() => renderConvergence({ outcome: "verified", remainder: [] }), /handoff URL and head SHA/);
});
