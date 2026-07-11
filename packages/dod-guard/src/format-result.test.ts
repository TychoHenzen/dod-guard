import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { formatCheckResult } from "./format-result.js";
import type { CheckResult } from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function baseResult(overrides?: Partial<CheckResult>): CheckResult {
  return {
    overall: "pass",
    leaves: [],
    summary: "All 3 proofs passed. 0 drafts.",
    timestamp: "2024-01-01T00:00:00.000Z",
    proof_fingerprint: "abc123def456",
    draft_count: 0,
    manual_unverified: 0,
    amendment_warnings: [],
    blocked_by_manuals: false,
    ...overrides,
  };
}

// ── Basic output ────────────────────────────────────────────────────────

describe("formatCheckResult - basic", () => {
  it("renders overall status header", () => {
    const result = baseResult({ overall: "pass" });
    const output = formatCheckResult(result);
    assert.match(output, /## DoD Check Result: PASS/);
  });

  it("renders FAIL status", () => {
    const result = baseResult({ overall: "fail" });
    const output = formatCheckResult(result);
    assert.match(output, /## DoD Check Result: FAIL/);
  });

  it("renders INCOMPLETE status", () => {
    const result = baseResult({ overall: "incomplete" });
    const output = formatCheckResult(result);
    assert.match(output, /## DoD Check Result: INCOMPLETE/);
  });

  it("always includes summary line", () => {
    const result = baseResult({ summary: "2 of 3 proofs failed — see details above." });
    const output = formatCheckResult(result);
    assert.match(output, /\*\*Summary:\*\* 2 of 3 proofs failed/);
  });

  it("includes timestamp", () => {
    const result = baseResult({ timestamp: "2025-06-15T12:00:00Z" });
    const output = formatCheckResult(result);
    assert.match(output, /\*\*Timestamp:\*\* 2025-06-15T12:00:00Z/);
  });

  it("includes proof fingerprint", () => {
    const result = baseResult({ proof_fingerprint: "feedface" });
    const output = formatCheckResult(result);
    assert.match(output, /\*\*Proof fingerprint:\*\* `feedface`/);
  });
});

// ── Tamper detection ────────────────────────────────────────────────────

describe("formatCheckResult - tamper", () => {
  it("shows tamper warning when tampered is true", () => {
    const result = baseResult({ tampered: true, overall: "fail" });
    const output = formatCheckResult(result);
    assert.match(output, /TAMPER DETECTED/);
    assert.match(output, /proof-set fingerprint mismatch/);
  });

  it("does not show tamper warning when tampered is false", () => {
    const result = baseResult({ tampered: false });
    const output = formatCheckResult(result);
    assert.ok(!output.includes("TAMPER DETECTED"));
  });
});

// ── Blocked by manuals ─────────────────────────────────────────────────

describe("formatCheckResult - blocked by manuals", () => {
  it("shows blocked message when blocked_by_manuals is true", () => {
    const result = baseResult({
      blocked_by_manuals: true,
      manual_unverified: 3,
    });
    const output = formatCheckResult(result);
    assert.match(output, /BLOCKED: Manual verification required/);
    assert.match(output, /3 manual\/review proof/);
  });

  it("does not show blocked message when false", () => {
    const result = baseResult({ blocked_by_manuals: false });
    const output = formatCheckResult(result);
    assert.ok(!output.includes("BLOCKED: Manual verification required"));
  });
});

// ── Scoped runs ─────────────────────────────────────────────────────────

describe("formatCheckResult - scoped runs", () => {
  it("shows scoped run notice when scoped is true", () => {
    const result = baseResult({
      scoped: true,
      ran_node_path: "0.children.2",
      overall: "incomplete",
    });
    const output = formatCheckResult(result);
    assert.match(output, /Scoped run/);
    assert.match(output, /"0\.children\.2"/);
    assert.match(output, /This is NOT a completion verdict/);
  });

  it("does not show scoped notice when not scoped", () => {
    const result = baseResult({ scoped: false });
    const output = formatCheckResult(result);
    assert.ok(!output.includes("Scoped run"));
  });
});

// ── Draft nodes ─────────────────────────────────────────────────────────

describe("formatCheckResult - drafts", () => {
  it("shows draft count warning when draft_count > 0", () => {
    const result = baseResult({ draft_count: 2, overall: "incomplete" });
    const output = formatCheckResult(result);
    assert.match(output, /2 draft node/);
    assert.match(output, /dod_refine to concretize/);
  });

  it("does not show draft warning when draft_count is 0", () => {
    const result = baseResult({ draft_count: 0 });
    const output = formatCheckResult(result);
    assert.ok(!output.includes("draft node"));
  });
});

// ── Amendment warnings ─────────────────────────────────────────────────

describe("formatCheckResult - amendment warnings", () => {
  it("shows amendment warnings when present", () => {
    const result = baseResult({
      amendment_warnings: [
        { node_path: "0.children.1", title: "Check build", count: 3 },
        { node_path: "1.children.0", title: "Run tests", count: 5 },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /Amendment cycle warnings/);
    assert.match(output, /"Check build".*3 amendments/);
    assert.match(output, /"Run tests".*5 amendments/);
  });

  it("does not show amendment section when empty", () => {
    const result = baseResult({ amendment_warnings: [] });
    const output = formatCheckResult(result);
    assert.ok(!output.includes("Amendment cycle warnings"));
  });
});

// ── Leaf rendering ──────────────────────────────────────────────────────

describe("formatCheckResult - leaf rendering", () => {
  it("renders pass leaf with command and duration", () => {
    const result = baseResult({
      leaves: [
        {
          node_path: "0.children.0",
          id: "n1",
          title: "Root",
          description: "Lint check",
          status: "pass",
          command: "npm run lint",
          output: "no errors",
          duration_ms: 42,
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /✅.*Root.*PASS/);
    assert.match(output, /✓.*`npm run lint`.*42ms/);
  });

  it("renders failed leaf with exit code and error", () => {
    const result = baseResult({
      overall: "fail",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n2",
          title: "Root",
          description: "Test suite",
          status: "fail",
          command: "npm test",
          exit_code: 1,
          error: "2 test failures",
          output: "",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /❌.*Root.*FAIL/);
    assert.match(output, /✗.*`npm test`/);
    assert.match(output, /exit code: 1/);
    assert.match(output, /2 test failures/);
  });

  it("renders draft leaf with concretize hint", () => {
    const result = baseResult({
      overall: "incomplete",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n3",
          title: "Root",
          description: "Not yet refined",
          status: "draft",
          command: "",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /📝.*INCOMPLETE/);
    assert.match(output, /DRAFT.*dod_refine to concretize/);
  });

  it("renders skipped leaf with command and output note", () => {
    const result = baseResult({
      overall: "incomplete",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n4",
          title: "Root",
          description: "Manual proof",
          status: "skipped",
          command: "manual",
          output: 'not verified — dod_verify(dod_id, "n4")',
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /⏳.*`manual`/);
    assert.match(output, /dod_verify/);
  });

  it("renders manual pass with human-confirmed note", () => {
    const result = baseResult({
      leaves: [
        {
          node_path: "0.children.0",
          id: "n5",
          title: "Root",
          description: "Manual check",
          status: "pass",
          command: "manual",
          output: "✓ Manual verification PASS (dod_verify) 2024-01-01/popup",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /✓ MANUAL/);
    assert.match(output, /Manual check/);
  });

  it("renders manual fail with error detail", () => {
    const result = baseResult({
      overall: "fail",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n6",
          title: "Root",
          description: "Visual check",
          status: "fail",
          command: "manual",
          error: "Manual verification confirmed failing.",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /✗ MANUAL/);
    assert.match(output, /Visual check/);
    assert.match(output, /confirmed failing/);
  });

  it("groups leaves by root-level prefix", () => {
    const result = baseResult({
      leaves: [
        {
          node_path: "0.children.0",
          id: "n7",
          title: "Root A",
          description: "Proof 0",
          status: "pass",
          command: "echo a",
        },
        {
          node_path: "1.children.0",
          id: "n8",
          title: "Root B",
          description: "Proof 1",
          status: "pass",
          command: "echo b",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /Root A/);
    assert.match(output, /Root B/);
  });

  it("shows count string with pass/fail/skipped/draft counts", () => {
    const result = baseResult({
      overall: "fail",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n9",
          title: "Root",
          description: "pass",
          status: "pass",
          command: "true",
        },
        {
          node_path: "0.children.1",
          id: "n10",
          title: "Root",
          description: "fail",
          status: "fail",
          command: "false",
          exit_code: 1,
        },
        {
          node_path: "0.children.2",
          id: "n11",
          title: "Root",
          description: "skip",
          status: "skipped",
          command: "echo skip",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /1 pass, 1 fail, 1 skipped/);
  });

  it("indents nested children based on depth", () => {
    const result = baseResult({
      leaves: [
        {
          node_path: "0.children.0",
          id: "n12",
          title: "Root",
          description: "Top level",
          status: "pass",
          command: "cmd-top",
        },
        {
          node_path: "0.children.0.children.1",
          id: "n13",
          title: "Root",
          description: "Nested",
          status: "pass",
          command: "cmd-nested",
        },
      ],
    });
    const output = formatCheckResult(result);
    // depth = split(".children.").length - 1
    // Top: "0.children.0" → ["0","0"].length-1=1 → indent = "  ".repeat(2) = 4 spaces
    // Nested: "0.children.0.children.1" → ["0","0","1"].length-1=2 → indent = "  ".repeat(3) = 6 spaces
    assert.match(output, / {4}✓.*cmd-top/);
    assert.match(output, / {6}✓.*cmd-nested/);
  });

  it("truncates long error output to 5 lines", () => {
    const longError = Array.from({ length: 10 }, (_, i) => `error line ${i + 1}`).join("\n");
    const result = baseResult({
      overall: "fail",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n14",
          title: "Root",
          description: "Long error",
          status: "fail",
          command: "failing",
          exit_code: 1,
          error: longError,
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /error line 1/);
    assert.match(output, /error line 5/);
    assert.ok(!output.includes("error line 6"));
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("formatCheckResult - edge cases", () => {
  it("handles empty leaves list", () => {
    const result = baseResult({ leaves: [] });
    const output = formatCheckResult(result);
    assert.ok(output.length > 0);
    assert.match(output, /## DoD Check Result:/);
  });

  it("handles leaf with undefined output", () => {
    const result = baseResult({
      leaves: [
        {
          node_path: "0.children.0",
          id: "n15",
          title: "Root",
          description: "No output",
          status: "pass",
          command: "true",
          output: undefined,
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /✓.*`true`/);
  });

  it("handles leaf with undefined exit_code and error", () => {
    const result = baseResult({
      overall: "fail",
      leaves: [
        {
          node_path: "0.children.0",
          id: "n16",
          title: "Root",
          description: "Minimal fail",
          status: "fail",
          command: "bad-cmd",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /✗.*`bad-cmd`/);
  });

  it("handles draft-only tree", () => {
    const result = baseResult({
      overall: "incomplete",
      draft_count: 2,
      leaves: [
        {
          node_path: "0.children.0",
          id: "n17",
          title: "Root",
          description: "Draft leaf 1",
          status: "draft",
          command: "",
        },
      ],
    });
    const output = formatCheckResult(result);
    assert.match(output, /📝.*INCOMPLETE/);
    assert.match(output, /DRAFT/);
  });
});
