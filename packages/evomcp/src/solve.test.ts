// Unit tests for solve.ts and agent.ts helpers.
// Tests internal pure functions only — does NOT spawn claude -p subprocesses.

import assert from "node:assert";
import { describe, it } from "node:test";
import { hashFailure, repairPrompt, strategyPrompts, toVerdict } from "./agent.js";

describe("hashFailure", () => {
  it("returns a string hash", () => {
    const hash = hashFailure("some error output");
    assert.strictEqual(typeof hash, "string");
    assert.ok(hash.length > 0);
  });

  it("produces same hash for same input", () => {
    assert.strictEqual(hashFailure("error"), hashFailure("error"));
  });

  it("produces different hash for different input", () => {
    assert.notStrictEqual(hashFailure("error A"), hashFailure("error B"));
  });

  it("handles empty string", () => {
    const hash = hashFailure("");
    assert.strictEqual(typeof hash, "string");
    assert.ok(hash.length > 0);
  });

  it("handles very long output", () => {
    const long = "x".repeat(100000);
    const hash = hashFailure(long);
    assert.strictEqual(typeof hash, "string");
    assert.ok(hash.length > 0);
  });

  it("is case-sensitive", () => {
    assert.notStrictEqual(hashFailure("Error"), hashFailure("error"));
  });
});

describe("toVerdict", () => {
  it("parses exit code from output", () => {
    const v = toVerdict({ exitCode: 0, output: "ok", durationMs: 100 });
    assert.strictEqual(v.exit_code, 0);
    assert.strictEqual(v.output, "ok");
    assert.strictEqual(v.duration_ms, 100);
  });

  it("handles non-zero exit code", () => {
    const v = toVerdict({ exitCode: 2, output: "command not found", durationMs: 50 });
    assert.strictEqual(v.exit_code, 2);
    assert.strictEqual(v.passed, false);
  });

  it("handles empty output", () => {
    const v = toVerdict({ exitCode: 0, output: "", durationMs: 0 });
    assert.strictEqual(v.output, "");
    assert.strictEqual(v.passed, true);
  });

  it("sets passed=true when exitCode is 0", () => {
    const v = toVerdict({ exitCode: 0, output: "pass", durationMs: 42 });
    assert.strictEqual(v.passed, true);
  });

  it("sets passed=false when exitCode is non-zero", () => {
    const v = toVerdict({ exitCode: 1, output: "fail", durationMs: 99 });
    assert.strictEqual(v.passed, false);
  });

  it("handles negative exit code", () => {
    const v = toVerdict({ exitCode: -1, output: "signal", durationMs: 500 });
    assert.strictEqual(v.passed, false);
    assert.strictEqual(v.exit_code, -1);
  });
});

describe("strategyPrompts", () => {
  it("returns N prompts", () => {
    const prompts = strategyPrompts("fix login bug", 3);
    assert.strictEqual(prompts.length, 3);
  });

  it("each prompt includes the task description", () => {
    const prompts = strategyPrompts("add rate limiting", 5);
    for (const p of prompts) {
      assert.ok(p.includes("add rate limiting"), `expected prompt to mention task: "${p.slice(0, 50)}..."`);
    }
  });

  it("returns 0 prompts for n=0", () => {
    const prompts = strategyPrompts("test", 0);
    assert.strictEqual(prompts.length, 0);
  });

  it("includes context when provided", () => {
    const prompts = strategyPrompts("task", 1, "use Python");
    assert.ok(prompts.some((p) => p.includes("Python")));
  });

  it("never returns more than requested", () => {
    const prompts = strategyPrompts("task", 100);
    assert.strictEqual(prompts.length, 100);
  });
});

describe("repairPrompt", () => {
  it("contains the task description", () => {
    const p = repairPrompt("fix login", "test failed: expected 200 got 500", 1);
    assert.ok(p.includes("fix login"));
  });

  it("contains the failure output", () => {
    const p = repairPrompt("task", "expected 200 got 500", 1);
    assert.ok(p.includes("expected 200 got 500"));
  });

  it("mentions repair attempt number", () => {
    const p = repairPrompt("task", "error", 2);
    assert.ok(p.includes("2") || p.includes("second") || p.includes("repair"));
  });

  it("includes context when provided", () => {
    const p = repairPrompt("task", "error", 1, "use Node.js");
    assert.ok(p.includes("Node.js"));
  });
});
