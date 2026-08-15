import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type AttemptResult, blankResult } from "./attempt-result.js";
import { buildEscalation, checkpointFailure } from "./solve-report.js";

const CLOSING = "Escalate to Claude: solve the specific failing assertion directly.";

interface AttemptShape {
  id?: string;
  exitCode?: number;
  diff?: string;
  output?: string;
  repairs?: number;
  signatures?: string[];
}

function attempt(shape: AttemptShape = {}): AttemptResult {
  const state = blankResult({ index: 0, label: "simplest", prompt: "go" });
  state.diff = shape.diff ?? "";
  state.output = shape.output ?? "";
  state.exitCode = shape.exitCode ?? -1;
  state.diagnostic.lineage_id = shape.id ?? state.diagnostic.lineage_id;
  state.diagnostic.repair_attempts = shape.repairs ?? 0;
  if (shape.signatures) {
    const flags = { stuck: false, oscillating: false, noProgress: false };
    state.diagnostic.signature_history = { signatures: shape.signatures, ...flags };
  }
  return state;
}

describe("buildEscalation failure signature", () => {
  it("reports unknown when no attempt recorded a signature", () => {
    assert.equal(buildEscalation([], []).failure_signature, "unknown");
    assert.equal(buildEscalation([attempt()], []).failure_signature, "unknown");
  });

  it("reports the signature seen most often across attempts", () => {
    const attempts = [attempt({ signatures: ["x", "y"] }), attempt({ signatures: ["y"] })];
    assert.equal(buildEscalation(attempts, []).failure_signature, "y");
  });

  it("keeps the first signature when two are equally frequent", () => {
    const attempts = [attempt({ signatures: ["x"] }), attempt({ signatures: ["y"] })];
    assert.equal(buildEscalation(attempts, []).failure_signature, "x");
  });

  it("counts a signature once per occurrence, including repeats in one lineage", () => {
    const attempts = [attempt({ signatures: ["x", "x"] }), attempt({ signatures: ["y"] })];
    assert.equal(buildEscalation(attempts, []).failure_signature, "x");
  });
});

describe("buildEscalation best partial patch", () => {
  it("offers nothing when no attempt reached a verification", () => {
    const report = buildEscalation([attempt({ exitCode: -1, diff: "big diff" })], []);
    assert.equal(report.best_partial_patch, undefined);
    assert.equal(report.best_output, undefined);
  });

  it("picks the attempt with the lowest verified exit code", () => {
    const attempts = [attempt({ exitCode: 2, diff: "two" }), attempt({ exitCode: 1, diff: "one" })];
    assert.equal(buildEscalation(attempts, []).best_partial_patch, "one");
  });

  it("breaks an exit-code tie with the larger diff", () => {
    const attempts = [attempt({ exitCode: 1, diff: "short" }), attempt({ exitCode: 1, diff: "much longer diff" })];
    assert.equal(buildEscalation(attempts, []).best_partial_patch, "much longer diff");
  });

  it("keeps an attempt that verified but committed nothing", () => {
    const attempts = [attempt({ exitCode: -1, diff: "big" }), attempt({ exitCode: 1, diff: "", output: "why" })];
    const report = buildEscalation(attempts, []);
    assert.equal(report.best_partial_patch, "");
    assert.equal(report.best_output, "why");
  });

  it("cuts the best output at 2000 characters", () => {
    const attempts = [attempt({ exitCode: 1, output: `${"y".repeat(2000)}TAIL` })];
    assert.equal(buildEscalation(attempts, []).best_output, "y".repeat(2000));
  });
});

describe("buildEscalation summary", () => {
  // covers: evomcp/solve :: A run with no surviving attempt returns an escalation report :: Every attempt fails
  it("reports zero lineages for an empty run", () => {
    const report = buildEscalation([], []);
    assert.equal(report.lineages_attempted, 0);
    assert.deepEqual(report.lineage_diagnostics, []);
    assert.equal(
      report.summary,
      `0 lineage(s) ran and none produced a verified patch. Most frequent failure signature: unknown. Repair tries: 0. ${CLOSING}`,
    );
  });

  it("adds up the repair tries of every lineage", () => {
    const attempts = [attempt({ repairs: 2, signatures: ["x"] }), attempt({ repairs: 3, signatures: ["x"] })];
    const report = buildEscalation(attempts, []);
    assert.equal(report.lineages_attempted, 2);
    assert.equal(
      report.summary,
      `2 lineage(s) ran and none produced a verified patch. Most frequent failure signature: x. Repair tries: 5. ${CLOSING}`,
    );
  });

  it("says nothing about rejections when there were none", () => {
    assert.equal(buildEscalation([attempt()], []).summary.includes("Degenerate"), false);
  });

  // covers: evomcp/solve :: A run with no surviving attempt returns an escalation report :: Some attempts were rejected by screening
  it("lists the rejections with their count", () => {
    const report = buildEscalation([attempt()], ["a rejected", "b rejected"]);
    assert.equal(report.summary.includes("Degenerate rejections (2): a rejected; b rejected"), true);
    assert.equal(report.summary.endsWith(CLOSING), true);
  });

  it("cuts the rejection detail at 500 characters", () => {
    const long = "z".repeat(600);
    const summary = buildEscalation([attempt()], [long]).summary;
    assert.equal(summary.includes(`Degenerate rejections (1): ${"z".repeat(500)} ${CLOSING}`), true);
  });

  it("returns the diagnostic of every attempt in order", () => {
    const attempts = [attempt({ id: "strategy-0" }), attempt({ id: "strategy-1" })];
    const report = buildEscalation(attempts, []);
    const ids = (report.lineage_diagnostics ?? []).map((d) => d.lineage_id);
    assert.deepEqual(ids, ["strategy-0", "strategy-1"]);
  });
});

describe("checkpointFailure", () => {
  // covers: evomcp/solve :: A checkpoint gate runs before any attempt :: Checkpoint fails
  it("names the checkpoint as the failure and reports no lineage", () => {
    const report = checkpointFailure("git is not a repository");
    assert.equal(report.failure_signature, "checkpoint_failed");
    assert.equal(report.lineages_attempted, 0);
    assert.deepEqual(report.lineage_diagnostics, []);
    assert.equal(report.best_partial_patch, undefined);
  });

  it("carries the cause in the summary, for a caller with no progress sink", () => {
    assert.equal(
      checkpointFailure("boom").summary,
      `No attempt ran. Failed to create gitevo checkpoint: boom. ${CLOSING}`,
    );
  });
});
