import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildJudgePrompt, feedbackActionPrompt, mutationPrompt, repairPrompt, strategyPrompts } from "./prompts.js";
import type { Diagnostic } from "./types.js";

// ── strategyPrompts ────────────────────────────────────────────────────

describe("strategyPrompts", () => {
  it("generates N prompts", () => {
    const prompts = strategyPrompts("Fix the bug", 3);
    assert.equal(prompts.length, 3);
    for (const p of prompts) {
      assert.ok(p.includes("Fix the bug"));
      assert.ok(p.includes("Strategy"));
    }
  });

  it("includes context when provided", () => {
    const prompts = strategyPrompts("Task", 1, "Some context info");
    assert.ok(prompts[0].includes("## Context"));
    assert.ok(prompts[0].includes("Some context info"));
  });

  it("includes failure context when provided", () => {
    const prompts = strategyPrompts("Task", 1, undefined, "Previous failures here");
    assert.ok(prompts[0].includes("## Failures to Avoid"));
    assert.ok(prompts[0].includes("Previous failures here"));
  });

  it("cycles strategies when N > 8", () => {
    const prompts = strategyPrompts("Task", 12);
    assert.equal(prompts.length, 12);
    // First 8 use strategies[0..7], next 4 repeat strategies[0..3]
  });

  it("all prompts contain Task header", () => {
    const prompts = strategyPrompts("Implement X", 5);
    for (const p of prompts) {
      assert.ok(p.includes("## Task"));
      assert.ok(p.includes("Implement X"));
    }
  });
});

// ── repairPrompt ───────────────────────────────────────────────────────

describe("repairPrompt", () => {
  it("includes task", () => {
    const prompt = repairPrompt("Fix auth bug", [], 1);
    assert.ok(prompt.includes("Fix auth bug"));
  });

  it("includes attempt number", () => {
    const prompt = repairPrompt("Task", [], 3);
    assert.ok(prompt.includes("attempt #3"));
  });

  it("formats diagnostics with file:line", () => {
    const diags: Diagnostic[] = [
      { file: "src/auth.ts", line: 42, severity: "error", message: "Type mismatch", context: "" },
    ];
    const prompt = repairPrompt("Task", diags, 1);
    assert.ok(prompt.includes("src/auth.ts:42"));
    assert.ok(prompt.includes("Type mismatch"));
  });

  it("handles empty diagnostics gracefully", () => {
    const prompt = repairPrompt("Task", [], 1);
    assert.ok(prompt.includes("(no structured diagnostics available)"));
  });

  it("caps at 10 diagnostics", () => {
    const diags: Diagnostic[] = Array.from({ length: 15 }, (_, i) => ({
      file: `src/file${i}.ts`,
      line: i,
      severity: "error",
      message: `Error ${i}`,
      context: "",
    }));
    const prompt = repairPrompt("Task", diags, 1);
    // Should only include 10
    const matches = prompt.match(/file\d+\.ts/g);
    assert.ok((matches?.length ?? 0) <= 10);
  });

  it("includes context section when provided", () => {
    const prompt = repairPrompt("Task", [], 1, "Additional context");
    assert.ok(prompt.includes("## Context"));
  });
});

// ── mutationPrompt ─────────────────────────────────────────────────────

describe("mutationPrompt", () => {
  it("includes goal and fitness", () => {
    const prompt = mutationPrompt("Optimize sorting", "const x = [];", 0.75, []);
    assert.ok(prompt.includes("Optimize sorting"));
    assert.ok(prompt.includes("0.75"));
  });

  it("includes elite examples when provided", () => {
    const elites = [
      { code: "const best = [1,2,3].sort();", score: 0.95 },
      { code: "const good = [].concat(arr).sort();", score: 0.8 },
    ];
    const prompt = mutationPrompt("Goal", "current code", 0.5, elites);
    assert.ok(prompt.includes("Elite #1"));
    assert.ok(prompt.includes("0.95"));
    assert.ok(prompt.includes("Elite #2"));
  });

  it("omits elite section when empty", () => {
    const prompt = mutationPrompt("Goal", "code", 0.5, []);
    assert.ok(!prompt.includes("Elite"));
  });
});

// ── buildJudgePrompt ───────────────────────────────────────────────────

describe("buildJudgePrompt", () => {
  it("includes all branch names", () => {
    const prompt = buildJudgePrompt([
      { name: "branch-alpha", diff: "diff content" },
      { name: "branch-beta", diff: "other diff" },
    ]);
    assert.ok(prompt.includes("branch-alpha"));
    assert.ok(prompt.includes("branch-beta"));
  });

  it("includes rubric dimensions", () => {
    const prompt = buildJudgePrompt([{ name: "b1", diff: "diff" }]);
    assert.ok(prompt.includes("correctness"));
    assert.ok(prompt.includes("clarity"));
    assert.ok(prompt.includes("efficiency"));
    assert.ok(prompt.includes("maintainability"));
  });

  it("includes fitness score when provided", () => {
    const prompt = buildJudgePrompt([{ name: "b1", diff: "diff", score: 0.8723 }]);
    assert.ok(prompt.includes("0.8723"));
  });

  it("includes verification report when provided", () => {
    const prompt = buildJudgePrompt([
      {
        name: "b1",
        diff: "diff",
        verificationReport: "All tests passed",
      },
    ]);
    assert.ok(prompt.includes("All tests passed"));
  });

  it("truncates long diffs", () => {
    const longDiff = "a".repeat(5000);
    const prompt = buildJudgePrompt([{ name: "b1", diff: longDiff }]);
    assert.ok(prompt.length < longDiff.length + 2000);
    assert.ok(prompt.includes("[truncated]"));
  });

  it("handles single branch", () => {
    const prompt = buildJudgePrompt([{ name: "solo", diff: "diff" }]);
    assert.ok(prompt.includes("solo"));
  });
});

// ── feedbackActionPrompt ───────────────────────────────────────────────

describe("feedbackActionPrompt", () => {
  it("includes task and diagnostics", () => {
    const diags: Diagnostic[] = [{ file: "src/x.ts", line: 1, severity: "error", message: "Bad import", context: "" }];
    const prompt = feedbackActionPrompt("Fix imports", diags);
    assert.ok(prompt.includes("Fix imports"));
    assert.ok(prompt.includes("Bad import"));
  });

  it("falls back to repair format when no diagnostics", () => {
    const prompt = feedbackActionPrompt("Task", []);
    assert.ok(prompt.includes("Task"));
  });
});
