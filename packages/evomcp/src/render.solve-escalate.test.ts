/**
 * Characterization tests for render.ts, formatSolveResult escalate branch
 * and its per-lineage diagnostics. These pin the text an MCP client reads.
 *
 * Build the package first (npx tsc or npm run build -w packages/evomcp).
 * The test script runs against dist/, so this file must compile to
 * dist/render-solve-escalate.test.js for `node --test "dist/*.test.js"`
 * to find it.
 */

import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSolveResult } from "./render.js";
import type { LineageDiagnostic, RunStats, SolveResult } from "./types.js";

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

describe("formatSolveResult, escalate outcome", () => {
  function escalateBase(overrides: Partial<NonNullable<SolveResult["escalation"]>> = {}): SolveResult {
    return {
      outcome: "escalate",
      stats: stats(),
      escalation: {
        failure_signature: "sig-abc123",
        lineages_attempted: 4,
        summary: "all lineages hit the same type error",
        ...overrides,
      },
    };
  }

  it("marks the run as escalated, not passed", () => {
    const text = formatSolveResult(escalateBase());
    assert.match(text, /ESCALATED/);
    assert.doesNotMatch(text, /Solve: PASSED/);
  });

  it("shows the failure signature", () => {
    const text = formatSolveResult(escalateBase({ failure_signature: "sig-xyz789" }));
    assert.ok(text.includes("sig-xyz789"));
  });

  it("shows the escalation summary", () => {
    const text = formatSolveResult(escalateBase({ summary: "every lineage failed the type checker" }));
    assert.ok(text.includes("every lineage failed the type checker"));
  });

  it("shows how many lineages were attempted", () => {
    const text = formatSolveResult(escalateBase({ lineages_attempted: 9 }));
    assert.ok(text.includes("9"));
  });

  it("shows a placeholder when there is no best partial output", () => {
    const text = formatSolveResult(escalateBase());
    assert.match(text, /(no patch|none|n\/a)/i);
    assert.doesNotMatch(text, /undefined/);
  });

  it("shows the best partial output when present", () => {
    const text = formatSolveResult(escalateBase({ best_output: "closest attempt output: 3 of 4 tests passed" }));
    assert.ok(text.includes("closest attempt output: 3 of 4 tests passed"));
  });

  it("truncates best_output longer than its limit", () => {
    const huge = hugeString("OVERFLOW_MARKER");
    const text = formatSolveResult(escalateBase({ best_output: huge }));
    assert.ok(!text.includes("OVERFLOW_MARKER"));
    assert.ok(text.length < huge.length, "output is shorter than input");
  });

  it("still shows run stats on escalation", () => {
    const withStats = formatSolveResult({
      outcome: "escalate",
      stats: stats({ model: "distinct-model-name" }),
      escalation: { failure_signature: "s", lineages_attempted: 1, summary: "s" },
    });
    assert.ok(withStats.includes("distinct-model-name"));
  });

  it("marks the run escalated even when escalation itself is absent", () => {
    const text = formatSolveResult({
      outcome: "escalate",
      stats: stats(),
      escalation: undefined,
    });
    assert.match(text, /ESCALATED/);
    assert.doesNotMatch(text, /undefined/);
  });
});

describe("formatSolveResult, lineage diagnostics per final_status branch", () => {
  function diag(overrides: Partial<LineageDiagnostic>): LineageDiagnostic {
    return {
      lineage_id: "lineage-1",
      strategy: "robust",
      timed_out: false,
      claude_exit_code: 0,
      claude_no_output: false,
      claude_output_sample: "sample output",
      repair_attempts: 2,
      final_status: "passed",
      ...overrides,
    };
  }

  function render(d: LineageDiagnostic): string {
    return formatSolveResult({
      outcome: "escalate",
      stats: stats(),
      escalation: {
        failure_signature: "sig",
        lineages_attempted: 1,
        summary: "summary",
        lineage_diagnostics: [d],
      },
    });
  }

  it("passed lineage shows its verify exit code", () => {
    const text = render(diag({ final_status: "passed", verify_exit_code: 0 }));
    assert.ok(text.includes("verify_exit=0"));
  });

  it("passed lineage does not show a timeout or no-output marker", () => {
    const text = render(diag({ final_status: "passed", verify_exit_code: 0 }));
    assert.doesNotMatch(text, /TIMED OUT/);
    assert.doesNotMatch(text, /NO OUTPUT/);
  });

  it("failed lineage shows its verify exit code", () => {
    const text = render(diag({ final_status: "failed", verify_exit_code: 1 }));
    assert.ok(text.includes("verify_exit=1"));
  });

  it("stuck lineage shows its verify exit code", () => {
    const text = render(diag({ final_status: "stuck", verify_exit_code: 1 }));
    assert.ok(text.includes("verify_exit=1"));
  });

  it("missing verify_exit_code falls back to a not-applicable marker", () => {
    const text = render(diag({ final_status: "failed", verify_exit_code: undefined }));
    assert.doesNotMatch(text, /verify_exit=\d/);
  });

  it("no_output lineage flags the missing output and the exit code that produced it", () => {
    const text = render(diag({ final_status: "no_output", claude_no_output: true, claude_exit_code: 127 }));
    assert.match(text, /NO OUTPUT/);
    assert.ok(text.includes("127"));
  });

  it("no_output lineage carries an actionable proxy or API-key hint", () => {
    const text = render(diag({ final_status: "no_output", claude_no_output: true, claude_exit_code: 1 }));
    assert.match(text, /proxy or API key/i);
  });

  it("timed_out lineage hides a verify exit code left over from an earlier round", () => {
    const text = render(diag({ final_status: "timed_out", timed_out: true, verify_exit_code: 1 }));
    assert.match(text, /TIMED OUT/);
    assert.doesNotMatch(text, /verify_exit=\d/);
  });

  it("no_output lineage hides a verify exit code left over from an earlier round", () => {
    const text = render(
      diag({ final_status: "no_output", claude_no_output: true, claude_exit_code: 7, verify_exit_code: 1 }),
    );
    assert.match(text, /NO OUTPUT/);
    assert.doesNotMatch(text, /verify_exit=\d/);
  });

  it("timed_out lineage flags the timeout", () => {
    const text = render(diag({ final_status: "timed_out", timed_out: true }));
    assert.match(text, /TIMED OUT/);
  });

  it("timed_out lineage carries an actionable retry hint", () => {
    const text = render(diag({ final_status: "timed_out", timed_out: true }));
    assert.match(text, /increase timeout/i);
  });

  it("a passing lineage carries neither the no-output nor the timeout hint", () => {
    const text = render(diag({ final_status: "passed", verify_exit_code: 0 }));
    assert.doesNotMatch(text, /proxy or API key/i);
    assert.doesNotMatch(text, /increase timeout/i);
  });

  it("omits the lineage diagnostics section entirely when there are none", () => {
    const text = formatSolveResult({
      outcome: "escalate",
      stats: stats(),
      escalation: {
        failure_signature: "sig",
        lineages_attempted: 1,
        summary: "summary",
      },
    });
    assert.doesNotMatch(text, /Lineage Diagnostics/);
  });

  it("shows the lineage id, strategy and repair attempt count", () => {
    const text = render(diag({ lineage_id: "lineage-xyz", strategy: "defensive", repair_attempts: 5 }));
    assert.ok(text.includes("lineage-xyz"));
    assert.ok(text.includes("defensive"));
    assert.ok(text.includes("5"));
  });
});
