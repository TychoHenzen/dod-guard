import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { hashFailure, extractScore, toVerdict, strategyPrompts, repairPrompt, mutationPrompt } from "./agent.js";

describe("hashFailure", () => {
  it("returns a hex string", () => {
    const h = hashFailure("some error output");
    assert.ok(/^[0-9a-f]+$/.test(h), `expected hex, got ${h}`);
  });

  it("strips timestamps for stable hashing", () => {
    const a = hashFailure("Error at 2024-03-15T14:30:00: something went wrong");
    const b = hashFailure("Error at 2025-12-01T08:15:30: something went wrong");
    assert.equal(a, b, "timestamps should be normalized");
  });

  it("strips file paths with line numbers", () => {
    const a = hashFailure("at /home/user/project/src/foo.ts:42: TypeError");
    const b = hashFailure("at /opt/app/lib/bar.ts:99: TypeError");
    assert.equal(a, b, "file:line should be normalized");
  });

  it("strips hex addresses", () => {
    const a = hashFailure("at 0x7f8a1b2c3d4e: segfault");
    const b = hashFailure("at 0xdeadbeef1234: segfault");
    assert.equal(a, b, "hex addresses should be normalized");
  });

  it("strips duration values", () => {
    const a = hashFailure("test took 150.5ms to run");
    const b = hashFailure("test took 9999.9ms to run");
    assert.equal(a, b, "durations should be normalized");
  });

  it("produces different hashes for different errors", () => {
    const a = hashFailure("TypeError: undefined is not a function");
    const b = hashFailure("ReferenceError: x is not defined");
    assert.notEqual(a, b, "different errors should hash differently");
  });

  it("truncates long output to 500 chars", () => {
    const longStr = "x".repeat(2000);
    const h = hashFailure(longStr);
    assert.ok(/^[0-9a-f]+$/.test(h), "should handle long input");
  });
});

describe("extractScore", () => {
  it("extracts last number from output", () => {
    assert.equal(extractScore("Score: 42.5"), 42.5);
  });

  it("returns null for non-numeric output", () => {
    assert.equal(extractScore("All tests passed!"), null);
  });

  it("extracts negative numbers", () => {
    assert.equal(extractScore("Error count: -3"), -3);
  });

  it("extracts integer from mixed output", () => {
    assert.equal(extractScore("Lines: 150, Coverage: 85.2%, Score: 92"), 92);
  });

  it("returns null for empty string", () => {
    assert.equal(extractScore(""), null);
  });
});

describe("toVerdict", () => {
  it("converts exit 0 to passed true", () => {
    const v = toVerdict({ output: "ok", exitCode: 0, durationMs: 100 });
    assert.equal(v.passed, true);
    assert.equal(v.exit_code, 0);
    assert.equal(v.output, "ok");
    assert.equal(v.duration_ms, 100);
  });

  it("converts exit 1 to passed false", () => {
    const v = toVerdict({ output: "fail", exitCode: 1, durationMs: 50 });
    assert.equal(v.passed, false);
    assert.equal(v.exit_code, 1);
  });
});

describe("strategyPrompts", () => {
  it("generates N prompts", () => {
    const prompts = strategyPrompts("Fix the login bug", 3);
    assert.equal(prompts.length, 3);
  });

  it("each prompt includes the task", () => {
    const prompts = strategyPrompts("Add caching", 2);
    for (const p of prompts) {
      assert.ok(p.includes("Add caching"), "prompt should include task");
    }
  });

  it("wraps around strategies array", () => {
    const prompts = strategyPrompts("Task", 10);
    assert.equal(prompts.length, 10);
    // Each prompt should be non-empty and unique enough
    const unique = new Set(prompts);
    assert.ok(unique.size >= 8, `expected >= 8 unique, got ${unique.size}`);
  });

  it("includes context when provided", () => {
    const prompts = strategyPrompts("Task", 2, "Some context here");
    assert.ok(prompts[0].includes("Some context here"), "should include context");
  });

  it("each prompt has a strategy instruction", () => {
    const prompts = strategyPrompts("Task", 8);
    const strategies = [
      "simplest possible solution",
      "robust solution",
      "performant solution",
      "modular solution",
      "defensive solution",
      "functional-style solution",
      "pragmatic solution",
      "elegant solution",
    ];
    for (let i = 0; i < prompts.length; i++) {
      assert.ok(prompts[i].includes(strategies[i]), `prompt ${i} should include strategy`);
    }
  });
});

describe("repairPrompt", () => {
  it("includes task, failure output, and attempt number", () => {
    const p = repairPrompt("Fix bug", "Test failed: expected 5 got 3", 2);
    assert.ok(p.includes("Fix bug"), "should include task");
    assert.ok(p.includes("Test failed"), "should include failure output");
    assert.ok(p.includes("attempt #2"), "should include attempt number");
  });

  it("includes context when provided", () => {
    const p = repairPrompt("Fix bug", "failed", 1, "Extra context");
    assert.ok(p.includes("Extra context"), "should include context");
  });

  it("truncates long failure output", () => {
    const longFailure = "x".repeat(5000);
    const p = repairPrompt("Fix bug", longFailure, 1);
    assert.ok(p.length < longFailure.length + 500, "output should be truncated");
  });
});

describe("mutationPrompt", () => {
  it("includes goal, code, and fitness score", () => {
    const p = mutationPrompt("Optimize speed", "function foo() { return 1; }", 42.5, []);
    assert.ok(p.includes("Optimize speed"), "should include goal");
    assert.ok(p.includes("function foo"), "should include code");
    assert.ok(p.includes("42.50"), "should include fitness score");
  });

  it("includes elite examples when provided", () => {
    const elites = [
      { code: "function fast() { return 2; }", score: 95 },
      { code: "function faster() { return 3; }", score: 98 },
    ];
    const p = mutationPrompt("Goal", "code", 50, elites);
    assert.ok(p.includes("Elite #1"), "should include elite header");
    assert.ok(p.includes("function fast"), "should include elite code");
    assert.ok(p.includes("95.00"), "should include elite score");
  });

  it("omits elite section when elites empty", () => {
    const p = mutationPrompt("Goal", "code", 50, []);
    assert.ok(!p.includes("Elite"), "should not include elite section");
  });

  it("includes context when provided", () => {
    const p = mutationPrompt("Goal", "code", 50, [], "Some context");
    assert.ok(p.includes("Some context"), "should include context");
  });
});
