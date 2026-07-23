import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckResult, DodDocument, TaskNode } from "./types.js";
import { formatCheckResult } from "./format-result.js";

// ── Helpers ───────────────────────────────────────────────────────────

function leafResult(
  node_path: string,
  overrides: Partial<CheckResult["leaves"][number]> = {},
): CheckResult["leaves"][number] {
  return {
    node_path,
    id: `id-${node_path}`,
    title: `Leaf ${node_path}`,
    description: "test proof",
    status: "pass",
    command: "echo ok",
    duration_ms: 42,
    ...overrides,
  };
}

function makeResult(overrides: Partial<CheckResult> = {}): CheckResult {
  return {
    overall: "pass",
    leaves: [
      leafResult("0", { title: "Root A" }),
      leafResult("1", { title: "Root B" }),
    ],
    summary: "2/2 concrete proofs pass",
    timestamp: "2026-01-01T00:00:00Z",
    proof_fingerprint: "abc123",
    draft_count: 0,
    manual_unverified: 0,
    ...overrides,
  };
}

// ── Basic output ──────────────────────────────────────────────────────

test("formatCheckResult PASS output", () => {
  const out = formatCheckResult(makeResult());
  assert.ok(out.includes("PASS"));
  assert.ok(out.includes("✓"));
});

test("formatCheckResult FAIL output", () => {
  const out = formatCheckResult(makeResult({
    overall: "fail",
    leaves: [leafResult("0", { status: "fail", error: "expected exit 0 but got 1" })],
    summary: "0/1 concrete proofs pass",
  }));
  assert.ok(out.includes("FAIL"));
  assert.ok(out.includes("✗"));
  assert.ok(out.includes("expected exit 0 but got 1"));
});

test("formatCheckResult INCOMPLETE output", () => {
  const out = formatCheckResult(makeResult({ overall: "incomplete", draft_count: 2 }));
  assert.ok(out.includes("INCOMPLETE"));
});

test("formatCheckResult includes proof fingerprint", () => {
  const out = formatCheckResult(makeResult({ proof_fingerprint: "deadbeef" }));
  assert.ok(out.includes("deadbeef"));
});

test("formatCheckResult includes timestamp", () => {
  const out = formatCheckResult(makeResult());
  assert.ok(out.includes("2026-01-01T00:00:00Z"));
});

// ── Tamper detection ──────────────────────────────────────────────────

test("formatCheckResult tamper warning", () => {
  const out = formatCheckResult(makeResult({ tampered: true }));
  assert.ok(out.includes("TAMPER DETECTED"));
});

// ── Scoped runs ───────────────────────────────────────────────────────

test("formatCheckResult scoped run warning", () => {
  const out = formatCheckResult(makeResult({ scoped: true, ran_node_path: "0.children.1" }));
  assert.ok(out.includes("Scoped run"));
  assert.ok(out.includes("0.children.1"));
});

// ── Draft nodes ───────────────────────────────────────────────────────

test("formatCheckResult draft nodes shown", () => {
  const result = makeResult({
    overall: "incomplete",
    draft_count: 1,
    leaves: [
      leafResult("0", { title: "Root A" }),
      {
        node_path: "0.children.0",
        id: "d1",
        title: "Draft leaf",
        description: "not done yet",
        status: "draft",
        command: "",
      },
    ],
  });
  const out = formatCheckResult(result);
  assert.ok(out.includes("DRAFT"));
  assert.ok(out.includes("not done yet"));
});

// ── Manual unverified ─────────────────────────────────────────────────

test("formatCheckResult manual proofs warning", () => {
  const out = formatCheckResult(makeResult({ manual_unverified: 3 }));
  assert.ok(out.includes("3 manual/review proof"));
  assert.ok(out.includes("dod_verify"));
});

// ── Grouping ──────────────────────────────────────────────────────────

test("formatCheckResult groups leaves by root path", () => {
  const result = makeResult({
    leaves: [
      leafResult("0", { title: "Root A" }),
      leafResult("0.children.0", { title: "Child of A" }),
      leafResult("1", { title: "Root B" }),
    ],
  });
  const out = formatCheckResult(result);
  assert.ok(out.includes("Root A"));
  assert.ok(out.includes("Root B"));
});

// ── Failed leaf details ───────────────────────────────────────────────

test("formatCheckResult shows diagnosis on failure", () => {
  const result = makeResult({
    overall: "fail",
    leaves: [
      leafResult("0", {
        status: "fail",
        error: "something broke",
        diagnosis: "Expected exit code 0, got 1",
        exit_code: 1,
      }),
    ],
  });
  const out = formatCheckResult(result);
  assert.ok(out.includes("Diagnosis"));
  assert.ok(out.includes("exit code: 1"));
});

// ── Skips ─────────────────────────────────────────────────────────────

test("formatCheckResult skipped leaves shown with reason", () => {
  const result = makeResult({
    overall: "incomplete",
    leaves: [
      leafResult("0", {
        status: "skipped",
        error: "manual proof awaiting human verification",
      }),
    ],
  });
  const out = formatCheckResult(result);
  assert.ok(out.includes("not verified"));
});

// ── Git state ─────────────────────────────────────────────────────────

test("formatCheckResult shows git commit when available", () => {
  const out = formatCheckResult(makeResult({
    checked_commit: "abcdef1234567890abcdef1234567890abcdef12",
    is_git_repo: true,
    checked_dirty: false,
  }));
  assert.ok(out.includes("abcdef123456"));
  assert.ok(out.includes("clean"));
});

test("formatCheckResult shows dirty git state", () => {
  const out = formatCheckResult(makeResult({
    checked_commit: "abcdef1234567890abcdef1234567890abcdef12",
    is_git_repo: true,
    checked_dirty: true,
  }));
  assert.ok(out.includes("DIRTY"));
});

test("formatCheckResult shows non-git state", () => {
  const out = formatCheckResult(makeResult({ is_git_repo: false }));
  assert.ok(out.includes("not a git repository"));
});

// ── Summary mode ─────────────────────────────────────────────────────

test("formatCheckResult summary_mode true collapses drafts", () => {
  const result = makeResult({
    overall: "incomplete",
    draft_count: 3,
    summary_mode: true,
    leaves: [
      leafResult("0"),
      {
        node_path: "0.children.0",
        id: "d1",
        title: "Draft 1",
        description: "draft 1",
        status: "draft",
        command: "",
      },
      {
        node_path: "0.children.1",
        id: "d2",
        title: "Draft 2",
        description: "draft 2",
        status: "draft",
        command: "",
      },
    ],
  });
  const out = formatCheckResult(result);
  assert.ok(out.includes("draft node(s) unchanged"));
});
