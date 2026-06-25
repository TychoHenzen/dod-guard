import { test } from "node:test";
import assert from "node:assert/strict";
import { perProofFingerprint, resolveManual } from "./manual.js";
import type { Proof } from "./types.js";

function mkProof(over: Partial<Proof> = {}): Proof {
  return {
    id: "proof-1-1",
    command: "manual",
    predicate: { type: "manual" },
    description: "App launches and shows the dashboard",
    last_status: "pending",
    ...over,
  };
}

test("perProofFingerprint changes when description changes", () => {
  const a = perProofFingerprint(mkProof());
  const b = perProofFingerprint(mkProof({ description: "Different instructions" }));
  assert.notEqual(a, b);
});

test("perProofFingerprint changes when command changes", () => {
  const a = perProofFingerprint(mkProof());
  const b = perProofFingerprint(mkProof({ command: "open the app then check" }));
  assert.notEqual(a, b);
});

test("perProofFingerprint stable for identical proof", () => {
  assert.equal(perProofFingerprint(mkProof()), perProofFingerprint(mkProof()));
});

test("resolveManual asks the human when no cached result", async () => {
  const proof = mkProof();
  let asked = 0;
  const res = await resolveManual(proof, async () => {
    asked++;
    return { answer: "pass", channel: "messagebox" };
  });
  assert.equal(asked, 1);
  assert.equal(res.status, "pass");
  assert.equal(res.cached, false);
  assert.ok(proof.manual_result);
  assert.equal(proof.manual_result?.answer, "pass");
  assert.equal(proof.manual_result?.channel, "messagebox");
  assert.equal(proof.manual_result?.proof_fingerprint, perProofFingerprint(proof));
});

test("resolveManual reuses cached PASS without asking again", async () => {
  const proof = mkProof();
  await resolveManual(proof, async () => ({ answer: "pass", channel: "elicitation" }));
  let asked = 0;
  const res = await resolveManual(proof, async () => {
    asked++;
    return { answer: "fail", channel: "messagebox" };
  });
  assert.equal(asked, 0, "must not re-ask when cached PASS fingerprint matches");
  assert.equal(res.status, "pass");
  assert.equal(res.cached, true);
});

test("resolveManual re-asks when the proof changed after a cached PASS", async () => {
  const proof = mkProof();
  await resolveManual(proof, async () => ({ answer: "pass", channel: "elicitation" }));
  proof.description = "New, stricter manual check"; // proof changed -> fingerprint invalidated
  let asked = 0;
  const res = await resolveManual(proof, async () => {
    asked++;
    return { answer: "pass", channel: "messagebox" };
  });
  assert.equal(asked, 1, "must re-confirm after the proof changed");
  assert.equal(res.cached, false);
});

test("resolveManual does NOT cache a FAIL as reusable — re-asks next run", async () => {
  const proof = mkProof();
  await resolveManual(proof, async () => ({ answer: "fail", channel: "messagebox" }));
  let asked = 0;
  const res = await resolveManual(proof, async () => {
    asked++;
    return { answer: "pass", channel: "messagebox" };
  });
  assert.equal(asked, 1, "a prior FAIL must not short-circuit; give it another chance");
  assert.equal(res.status, "pass");
});

test("resolveManual carries the human note into the record and output", async () => {
  const proof = mkProof();
  const res = await resolveManual(proof, async () => ({
    answer: "pass",
    note: "looks good on device",
    channel: "elicitation",
  }));
  assert.equal(proof.manual_result?.note, "looks good on device");
  assert.match(res.output, /looks good on device/);
});
