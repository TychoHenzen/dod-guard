/**
 * Characterization tests for render.ts, formatOrchestrateResult. These pin
 * the text an MCP client reads, not the internal shape of render.ts.
 *
 * Build the package first (npx tsc or npm run build -w packages/evomcp).
 * The test script runs against dist/, so this file must compile to
 * dist/render-orchestrate.test.js for `node --test "dist/*.test.js"` to
 * find it.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatOrchestrateResult } from "./render.js";
import type { OrchestrateResult } from "./orchestrate.js";
import type { RunStats } from "./types.js";

function stats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    plans_sampled: 3,
    plans_deduped: 3,
    candidates_generated: 6,
    tokens_consumed: 15000,
    duration_ms: 1500,
    model: "deepseek-chat",
    ...overrides,
  };
}

// No caller or type states a byte budget for these fields. Only the
// fact that an oversized field does not survive whole is pinned here.
function hugeString(marker: string): string {
  return `${"A".repeat(50_000)}${marker}`;
}

function orchestrateBase(overrides: Partial<OrchestrateResult> = {}): OrchestrateResult {
  return {
    outcome: "pass",
    summary: "playbook completed all stages",
    stages: [],
    ...overrides,
  };
}

describe("formatOrchestrateResult", () => {
  it("uppercases the outcome for pass", () => {
    const text = formatOrchestrateResult(orchestrateBase({ outcome: "pass" }));
    assert.match(text, /PASS/);
  });

  it("uppercases the outcome for escalate", () => {
    const text = formatOrchestrateResult(orchestrateBase({ outcome: "escalate" }));
    assert.match(text, /ESCALATE/);
  });

  it("uppercases the outcome for incomplete", () => {
    const text = formatOrchestrateResult(orchestrateBase({ outcome: "incomplete" }));
    assert.match(text, /INCOMPLETE/);
  });

  it("shows the run summary", () => {
    const text = formatOrchestrateResult(orchestrateBase({ summary: "stopped at HARDEN: build failed" }));
    assert.ok(text.includes("stopped at HARDEN: build failed"));
  });

  it("shows the solve patch when the nested solve result passed", () => {
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "pass",
        solveResult: {
          outcome: "pass",
          patch: "diff --git a/nested b/nested\n+nested change",
          verification_report: "nested verification ok",
          stats: stats(),
        },
      }),
    );
    assert.ok(text.includes("diff --git a/nested b/nested\n+nested change"));
    assert.ok(text.includes("nested verification ok"));
  });

  it("shows the solve patch even when the orchestrate outcome itself is incomplete", () => {
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "incomplete",
        solveResult: {
          outcome: "pass",
          patch: "diff --git a/mid b/mid\n+mid-stage patch",
          verification_report: "mid verification ok",
          stats: stats(),
        },
      }),
    );
    assert.ok(text.includes("diff --git a/mid b/mid\n+mid-stage patch"));
  });

  it("omits the solve patch section when there is no nested solve result", () => {
    const text = formatOrchestrateResult(orchestrateBase({ outcome: "pass" }));
    assert.doesNotMatch(text, /Solve Patch/);
  });

  it("omits the solve patch section when the nested solve result escalated instead of passing", () => {
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "escalate",
        solveResult: {
          outcome: "escalate",
          stats: stats(),
          escalation: { failure_signature: "s", lineages_attempted: 1, summary: "s" },
        },
      }),
    );
    assert.doesNotMatch(text, /Solve Patch/);
  });

  it("falls back to a placeholder when the nested pass has no patch", () => {
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "pass",
        solveResult: {
          outcome: "pass",
          verification_report: "ok",
          stats: stats(),
        },
      }),
    );
    assert.match(text, /(no patch|none|n\/a)/i);
    assert.doesNotMatch(text, /undefined/);
  });

  it("falls back to a placeholder when the nested pass has no verification report", () => {
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "pass",
        solveResult: {
          outcome: "pass",
          patch: "p",
          stats: stats(),
        },
      }),
    );
    assert.match(text, /(no report|none|n\/a)/i);
    assert.doesNotMatch(text, /undefined/);
  });

  it("truncates the nested solve patch at its own limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "pass",
        solveResult: {
          outcome: "pass",
          patch: huge,
          verification_report: "ok",
          stats: stats(),
        },
      }),
    );
    assert.ok(!text.includes("OVERFLOW_MARKER"));
    assert.ok(text.length < huge.length, "output is shorter than input");
  });

  it("truncates the nested verification report at its own limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const text = formatOrchestrateResult(
      orchestrateBase({
        outcome: "pass",
        solveResult: {
          outcome: "pass",
          patch: "p",
          verification_report: huge,
          stats: stats(),
        },
      }),
    );
    assert.ok(!text.includes("OVERFLOW_MARKER"));
    assert.ok(text.length < huge.length, "output is shorter than input");
  });
});
