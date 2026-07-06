import { test } from "node:test";
import assert from "node:assert/strict";
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
  assert.notEqual(a, b);
});

test("perProofFingerprint changes when command changes", () => {
  const a = perProofFingerprint(mkNode());
  const b = perProofFingerprint(mkNode({ command: "other cmd" }));
  assert.notEqual(a, b);
});

test("perProofFingerprint stable for identical proof", () => {
  assert.equal(perProofFingerprint(mkNode()), perProofFingerprint(mkNode()));
});

test("resolveManual asks the human when no cached result", async () => {
  const node = mkNode();
  let asked = 0;
  const res = await resolveManual(node, async () => { asked++; return { answer: "pass", channel: "messagebox" }; });
  assert.equal(asked, 1);
  assert.equal(res.status, "pass");
  assert.equal(res.cached, false);
  assert.ok(node.manual_result);
  assert.equal(node.manual_result?.answer, "pass");
});

test("resolveManual reuses cached PASS without asking again", async () => {
  const node = mkNode();
  await resolveManual(node, async () => ({ answer: "pass", channel: "elicitation" }));
  let asked = 0;
  const res = await resolveManual(node, async () => { asked++; return { answer: "fail", channel: "messagebox" }; });
  assert.equal(asked, 0);
  assert.equal(res.status, "pass");
  assert.equal(res.cached, true);
});

test("resolveManual re-asks when proof changed after cached PASS", async () => {
  const node = mkNode();
  await resolveManual(node, async () => ({ answer: "pass", channel: "elicitation" }));
  node.description = "New stricter check";
  let asked = 0;
  const res = await resolveManual(node, async () => { asked++; return { answer: "pass", channel: "messagebox" }; });
  assert.equal(asked, 1);
  assert.equal(res.cached, false);
});

test("resolveManual does NOT cache FAIL — re-asks next run", async () => {
  const node = mkNode();
  await resolveManual(node, async () => ({ answer: "fail", channel: "messagebox" }));
  let asked = 0;
  const res = await resolveManual(node, async () => { asked++; return { answer: "pass", channel: "messagebox" }; });
  assert.equal(asked, 1);
  assert.equal(res.status, "pass");
});

test("resolveManual carries note into record and output", async () => {
  const node = mkNode();
  const res = await resolveManual(node, async () => ({ answer: "pass", note: "looks good", channel: "elicitation" }));
  assert.equal(node.manual_result?.note, "looks good");
  assert.match(res.output, /looks good/);
});
