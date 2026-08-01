import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AttemptSummary } from "./context.js";
import { baseContext, goalWithContext, repairContext } from "./solve-context.js";
import type { TaskSpec } from "./types.js";

const spec: TaskSpec = {
  goal: "make the login test pass",
  verify_cmd: "npm test",
  cwd: process.cwd(),
};

const tries: AttemptSummary[] = [
  {
    strategy: "simplest",
    outcome: "failed",
    summary: "expected 200, got 401",
    failureSignature: "hash-a",
  },
  {
    strategy: "simplest",
    outcome: "failed",
    summary: "expected 200, got 500",
    failureSignature: "hash-b",
  },
];

describe("goalWithContext", () => {
  it("returns the goal alone when no extra context is given", () => {
    assert.equal(goalWithContext(spec), spec.goal);
  });

  it("appends the caller context", () => {
    const withCtx = { ...spec, context: "the API moved to /v2" };
    assert.match(goalWithContext(withCtx), /the API moved to \/v2/);
  });
});

describe("repairContext", () => {
  it("carries the goal, like the first-try context", () => {
    assert.match(baseContext(spec).assembled, /make the login test pass/);
    assert.match(repairContext(spec, tries).assembled, /make the login test pass/);
  });

  it("adds what earlier tries produced", () => {
    const assembled = repairContext(spec, tries).assembled;
    assert.match(assembled, /expected 200, got 401/);
    assert.match(assembled, /expected 200, got 500/);
  });

  it("adds the failure signatures seen so far", () => {
    const assembled = repairContext(spec, tries).assembled;
    assert.match(assembled, /hash-a/);
    assert.match(assembled, /hash-b/);
  });

  it("differs from the first-try context once tries exist", () => {
    assert.notEqual(repairContext(spec, tries).hash, baseContext(spec).hash);
  });

  it("equals the first-try context when no try has run", () => {
    assert.equal(repairContext(spec, []).hash, baseContext(spec).hash);
  });
});
