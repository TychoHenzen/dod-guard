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
