// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
import { CompletionError } from "./completion-error.mjs";
import { buildStopReport } from "./stop-report.mjs";

test("reports code, message and recovery", () => {
  const error = new CompletionError("x", "m", { recovery: "r" });
  assert.deepEqual(buildStopReport(error), {
    ok: false,
    code: "x",
    message: "m",
    recovery: "r",
  });
});

test("omits recovery when absent", () => {
  const error = new CompletionError("x", "m");
  assert.deepEqual(buildStopReport(error), { ok: false, code: "x", message: "m" });
});

test("uses unknown for a plain Error", () => {
  const report = buildStopReport(new Error("plain"));
  assert.equal(report.code, "unknown");
  assert.equal(report.ok, false);
  assert.equal(report.message, "plain");
});
