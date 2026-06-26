import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDocument } from "./checker.js";
import type { DodDocument, Proof } from "./types.js";

function manualProof(id: string, desc: string): Proof {
  return { id, command: "manual", predicate: { type: "manual" }, description: desc, last_status: "pending" };
}

function docWith(proofs: Proof[]): DodDocument {
  return {
    id: "test",
    title: "t",
    goal: "g",
    date: "2026-01-01",
    cwd: process.cwd(),
    markdown_path: "X",
    created_at: "2026-01-01",
    locked: true,
    sections: { requirements: "r" },
    steps: [{ id: "step-1", title: "Manual step", proofs }],
    amendments: [],
  };
}

test("all-manual step passes when the human confirms PASS", async () => {
  const doc = docWith([manualProof("proof-1-1", "device smoke test")]);
  const res = await checkDocument(doc, undefined, async () => ({ answer: "pass", channel: "messagebox" }));
  assert.equal(res.overall, "pass");
  assert.equal(res.steps[0].status, "pass");
  assert.equal(res.steps[0].proofs[0].status, "pass");
});

test("all-manual step fails when the human rejects", async () => {
  const doc = docWith([manualProof("proof-1-1", "device smoke test")]);
  const res = await checkDocument(doc, undefined, async () => ({ answer: "fail", channel: "messagebox" }));
  assert.equal(res.overall, "fail");
  assert.equal(res.steps[0].proofs[0].status, "fail");
});

test("manual proof fails safely when no confirmer is available (headless)", async () => {
  const doc = docWith([manualProof("proof-1-1", "device smoke test")]);
  const res = await checkDocument(doc); // no confirmer supplied
  assert.equal(res.overall, "fail");
  assert.equal(res.steps[0].proofs[0].status, "fail");
});

test("confirmed manual PASS is cached — a second check does not re-ask the human", async () => {
  const doc = docWith([manualProof("proof-1-1", "device smoke test")]);
  let asks = 0;
  const confirm = async () => {
    asks++;
    return { answer: "pass" as const, channel: "messagebox" as const };
  };
  await checkDocument(doc, undefined, confirm);
  const second = await checkDocument(doc, undefined, confirm);
  assert.equal(asks, 1, "cached PASS must not trigger a second prompt");
  assert.equal(second.overall, "pass");
});

// ── WS-C: adversarial review proof (out-of-band, like manual) ──────

function reviewProof(id: string, desc: string): Proof {
  return { id, command: "code-review", predicate: { type: "review" }, description: desc, last_status: "pending" };
}

test("review proof passes when the reviewer confirms PASS", async () => {
  const doc = docWith([reviewProof("proof-1-1", "review diff vs requirements")]);
  const res = await checkDocument(doc, undefined, async () => ({ answer: "pass", channel: "elicitation" }));
  assert.equal(res.overall, "pass");
  assert.equal(res.steps[0].proofs[0].status, "pass");
});

test("review proof fails when the reviewer reports gaps", async () => {
  const doc = docWith([reviewProof("proof-1-1", "review diff vs requirements")]);
  const res = await checkDocument(doc, undefined, async () => ({ answer: "fail", channel: "elicitation" }));
  assert.equal(res.overall, "fail");
  assert.equal(res.steps[0].proofs[0].status, "fail");
});

test("review proof fails safely with no review channel (headless) — never auto-passes", async () => {
  const doc = docWith([reviewProof("proof-1-1", "review diff vs requirements")]);
  const res = await checkDocument(doc); // no confirmer
  assert.equal(res.steps[0].proofs[0].status, "fail");
});

test("a confirmed review PASS is cached — a second check does not re-ask", async () => {
  const doc = docWith([reviewProof("proof-1-1", "review diff vs requirements")]);
  let asks = 0;
  const confirm = async () => { asks++; return { answer: "pass" as const, channel: "elicitation" as const }; };
  await checkDocument(doc, undefined, confirm);
  const second = await checkDocument(doc, undefined, confirm);
  assert.equal(asks, 1, "cached review PASS must not re-prompt");
  assert.equal(second.overall, "pass");
});

// ── WS-A: incremental scoped checking (dod_check --step N) ──────────

function cmdProof(id: string, command: string, expectExit = 0): Proof {
  return { id, command, predicate: { type: "exit_code", value: expectExit }, description: id, last_status: "pending" };
}

/** step-1 proof passes (`exit 0`), step-2 proof fails (`exit 1` vs predicate exit_code 0). */
function twoStepDoc(): DodDocument {
  return {
    id: "test-2step",
    title: "t", goal: "g", date: "2026-01-01",
    cwd: process.cwd(), markdown_path: "X", created_at: "2026-01-01", locked: true,
    sections: { requirements: "r" },
    steps: [
      { id: "step-1", title: "First", proofs: [cmdProof("proof-1-1", "exit 0")] },
      { id: "step-2", title: "Second", proofs: [cmdProof("proof-2-1", "exit 1")] },
    ],
    amendments: [],
  };
}

test("scoped check runs only the target step and reports overall 'incomplete'", async () => {
  const doc = twoStepDoc();
  const res = await checkDocument(doc, undefined, undefined, { stepId: "step-1" });
  assert.equal(res.overall, "incomplete", "a scoped run must never report PASS — only a full run can");
  assert.equal(res.scoped, true);
  assert.equal(res.ran_step_id, "step-1");
  const step1 = res.steps.find(s => s.id === "step-1")!;
  assert.equal(step1.proofs[0].status, "pass");
});

test("scoped check carries other steps' last_status without re-running them", async () => {
  const doc = twoStepDoc();
  // step-2's proof would FAIL if executed (exit 1 vs predicate 0). Mark it
  // previously passed; a scoped run on step-1 must carry that, not re-run it.
  doc.steps[1].proofs[0].last_status = "pass";
  const res = await checkDocument(doc, undefined, undefined, { stepId: "step-1" });
  const step2 = res.steps.find(s => s.id === "step-2")!;
  assert.equal(step2.proofs[0].status, "pass", "carried from last_status, proving step-2 was not executed");
});

test("full check (no stepId) still computes overall pass/fail across all steps", async () => {
  const doc = twoStepDoc();
  const res = await checkDocument(doc);
  assert.equal(res.overall, "fail");
  assert.equal(res.scoped ?? false, false);
});
