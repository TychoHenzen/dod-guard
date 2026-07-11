import assert from "node:assert/strict";
import { test } from "node:test";
import { perProofFingerprint, resolveManual } from "./manual.js";
import type { TaskNode } from "./types.js";

function mkNode(over: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "node-1",
    title: "Manual check",
    refinement: "concrete",
    command: "manual",
    predicate: { type: "manual" },
    description: "App launches and shows the dashboard",
    last_status: "pending",
    ...over,
  };
}

test("perProofFingerprint changes when description changes", () => {
  const a = perProofFingerprint(mkNode());
  const b = perProofFingerprint(mkNode({ description: "Different" }));
  assert.notEqual(a, b, "fingerprint should change when description changes");
});

test("perProofFingerprint changes when command changes", () => {
  const a = perProofFingerprint(mkNode());
  const b = perProofFingerprint(mkNode({ command: "other cmd" }));
  assert.notEqual(a, b, "fingerprint should change when command changes");
});

test("perProofFingerprint stable for identical proof", () => {
  assert.equal(
    perProofFingerprint(mkNode()),
    perProofFingerprint(mkNode()),
    "identical proofs should have same fingerprint",
  );
});

test("perProofFingerprint changes when predicate type changes", () => {
  const a = perProofFingerprint(mkNode());
  const b = perProofFingerprint(mkNode({ predicate: { type: "review" } }));
  assert.notEqual(a, b, "fingerprint should change when predicate type changes");
});

test("perProofFingerprint changes when predicate value changes", () => {
  const a = perProofFingerprint(mkNode());
  const b = perProofFingerprint(mkNode({ predicate: { type: "manual", value: "custom" } }));
  assert.notEqual(a, b, "fingerprint should change when predicate value changes");
});

test("resolveManual asks the human when no cached result", async () => {
  const node = mkNode();
  let asked = 0;
  const res = await resolveManual(node, async () => {
    asked++;
    return { answer: "pass", channel: "messagebox" };
  });
  assert.equal(asked, 1, "should ask exactly once");
  assert.equal(res.status, "pass", "should return pass status");
  assert.equal(res.cached, false, "should not be cached");
  assert.ok(node.manual_result, "node should have manual_result set");
  assert.equal(node.manual_result?.answer, "pass", "manual_result answer should be pass");
});

test("resolveManual reuses cached PASS without asking again", async () => {
  const node = mkNode();
  await resolveManual(node, async () => ({ answer: "pass", channel: "elicitation" }));
  let asked = 0;
  const res = await resolveManual(node, async () => {
    asked++;
    return { answer: "fail", channel: "messagebox" };
  });
  assert.equal(asked, 0, "should not ask again for cached pass");
  assert.equal(res.status, "pass", "should reuse cached pass status");
  assert.equal(res.cached, true, "should be marked as cached");
});

test("resolveManual re-asks when proof changed after cached PASS", async () => {
  const node = mkNode();
  await resolveManual(node, async () => ({ answer: "pass", channel: "elicitation" }));
  node.description = "New stricter check";
  let asked = 0;
  const res = await resolveManual(node, async () => {
    asked++;
    return { answer: "pass", channel: "messagebox" };
  });
  assert.equal(asked, 1, "should ask again when proof changed");
  assert.equal(res.cached, false, "should not be cached after proof change");
});

test("resolveManual does NOT cache FAIL — re-asks next run", async () => {
  const node = mkNode();
  await resolveManual(node, async () => ({ answer: "fail", channel: "messagebox" }));
  let asked = 0;
  const res = await resolveManual(node, async () => {
    asked++;
    return { answer: "pass", channel: "messagebox" };
  });
  assert.equal(asked, 1, "should re-ask after uncached fail");
  assert.equal(res.status, "pass", "second run should honor pass");
});

test("resolveManual carries note into record and output", async () => {
  const node = mkNode();
  const res = await resolveManual(node, async () => ({ answer: "pass", note: "looks good", channel: "elicitation" }));
  assert.equal(node.manual_result?.note, "looks good", "note should be stored in manual_result");
  assert.match(res.output, /looks good/, "output should contain the note text");
});

test("resolveManual propagates confirmer rejection", async () => {
  const node = mkNode();
  await assert.rejects(
    () =>
      resolveManual(node, async () => {
        throw new Error("user declined");
      }),
    /user declined/,
    "confirmer rejection should propagate as error",
  );
  // Node should not be left with a stale manual_result after rejection
  assert.equal(node.manual_result, undefined, "node should not have stale manual_result after rejection");
});

test("perProofFingerprint includes command in fingerprint", () => {
  const a = mkNode({ command: "check auth" });
  const b = mkNode({ command: "check db" });
  assert.notEqual(
    perProofFingerprint(a),
    perProofFingerprint(b),
    "different commands should produce different fingerprints",
  );
});

test("perProofFingerprint differs across descriptions", () => {
  const a = mkNode({ description: "Verify login page" });
  const b = mkNode({ description: "Verify signup page" });
  assert.notEqual(
    perProofFingerprint(a),
    perProofFingerprint(b),
    "different descriptions should produce different fingerprints",
  );
});

test("perProofFingerprint stable for identical nodes", () => {
  const a = mkNode({ description: "Same check" });
  const b = mkNode({ description: "Same check" });
  assert.equal(perProofFingerprint(a), perProofFingerprint(b), "identical nodes should produce identical fingerprints");
});
