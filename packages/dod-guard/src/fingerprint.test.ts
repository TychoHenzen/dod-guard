import assert from "node:assert/strict";
import { test } from "node:test";
import { computeProofFingerprint, flattenConcreteLeaves } from "./fingerprint.js";
import type { TaskNode } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────

let nodeCounter = 0;
function nid(): string {
  return `fp-${++nodeCounter}`;
}

function concLeaf(
  overrides: Partial<TaskNode> = {},
): TaskNode {
  return {
    id: nid(),
    title: "test",
    refinement: "concrete",
    command: "echo ok",
    predicate: { type: "exit_code", value: 0 },
    description: "a proof",
    last_status: "pending",
    ...overrides,
  };
}

function group(children: TaskNode[], overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: nid(),
    title: "group",
    refinement: "concrete",
    children,
    last_status: "pending",
    ...overrides,
  };
}

// ── flattenConcreteLeaves ─────────────────────────────────────────────

test("flattenConcreteLeaves returns concrete leaves from flat roots", () => {
  const leaves = [concLeaf(), concLeaf(), concLeaf()];
  const result = flattenConcreteLeaves(leaves);
  assert.equal(result.length, 3);
});

test("flattenConcreteLeaves skips draft nodes", () => {
  const nodes: TaskNode[] = [
    concLeaf(),
    { id: nid(), title: "draft", refinement: "draft", intent: "todo", last_status: "draft" },
    concLeaf(),
  ];
  const result = flattenConcreteLeaves(nodes);
  assert.equal(result.length, 2);
});

test("flattenConcreteLeaves recurses into groups", () => {
  const nodes: TaskNode[] = [
    group([
      concLeaf(),
      concLeaf(),
    ]),
    concLeaf(),
  ];
  const result = flattenConcreteLeaves(nodes);
  assert.equal(result.length, 3);
});

test("flattenConcreteLeaves deeply nested groups", () => {
  const nodes: TaskNode[] = [
    group([
      group([
        group([
          concLeaf(),
        ]),
      ]),
    ]),
  ];
  const result = flattenConcreteLeaves(nodes);
  assert.equal(result.length, 1);
});

test("flattenConcreteLeaves empty roots", () => {
  assert.equal(flattenConcreteLeaves([]).length, 0);
});

test("flattenConcreteLeaves assigns correct paths", () => {
  const nodes: TaskNode[] = [concLeaf(), concLeaf()];
  const result = flattenConcreteLeaves(nodes);
  assert.equal(result[0].node_path, "0");
  assert.equal(result[1].node_path, "1");
});

test("flattenConcreteLeaves nested paths", () => {
  const nodes: TaskNode[] = [
    group([
      concLeaf(),
      group([
        concLeaf(),
      ]),
    ]),
    concLeaf(),
  ];
  const result = flattenConcreteLeaves(nodes);
  const paths = result.map((r) => r.node_path);
  assert.deepEqual(paths, ["0.children.0", "0.children.1.children.0", "1"]);
});

// ── computeProofFingerprint ────────────────────────────────────────────

test("computeProofFingerprint empty roots returns empty string", () => {
  assert.equal(computeProofFingerprint([]), "");
});

test("computeProofFingerprint same tree produces same hash", () => {
  const a = [concLeaf(), concLeaf()];
  const b = [concLeaf(), concLeaf()];
  // Mark the matching pairs with stable IDs
  a[0].id = "a1";
  a[1].id = "a2";
  b[0].id = "a1";
  b[1].id = "a2";
  assert.equal(computeProofFingerprint(a), computeProofFingerprint(b));
});

test("computeProofFingerprint different command produces different hash", () => {
  const a = [concLeaf({ command: "echo a", id: "x1" })];
  const b = [concLeaf({ command: "echo b", id: "x1" })];
  assert.notEqual(computeProofFingerprint(a), computeProofFingerprint(b));
});

test("computeProofFingerprint different predicate type produces different hash", () => {
  const a = [concLeaf({ predicate: { type: "exit_code" }, id: "x1" })];
  const b = [concLeaf({ predicate: { type: "output_contains", value: "ok" }, id: "x1" })];
  assert.notEqual(computeProofFingerprint(a), computeProofFingerprint(b));
});

test("computeProofFingerprint includes category in hash", () => {
  const a = [concLeaf({ category: "behavioral", id: "x1" })];
  const b = [concLeaf({ category: "wiring", id: "x1" })];
  assert.notEqual(computeProofFingerprint(a), computeProofFingerprint(b));
});

test("computeProofFingerprint includes advisory flag", () => {
  const a = [concLeaf({ advisory: true, id: "x1" })];
  const b = [concLeaf({ advisory: false, id: "x1" })];
  assert.notEqual(computeProofFingerprint(a), computeProofFingerprint(b));
});

test("computeProofFingerprint includes timeout_ms", () => {
  const a = [concLeaf({ predicate: { type: "exit_code", timeout_ms: 5000 }, id: "x1" })];
  const b = [concLeaf({ predicate: { type: "exit_code", timeout_ms: 30000 }, id: "x1" })];
  assert.notEqual(computeProofFingerprint(a), computeProofFingerprint(b));
});

test("computeProofFingerprint deterministic ordering by node ID", () => {
  const a = concLeaf({ id: "aaa" });
  const b = concLeaf({ id: "bbb" });
  // Order shouldn't matter — sorted by ID
  const fwd = computeProofFingerprint([a, b]);
  const rev = computeProofFingerprint([b, a]);
  assert.equal(fwd, rev);
});

test("computeProofFingerprint handles predicate without value", () => {
  const leaf = concLeaf({ predicate: { type: "exit_code" }, id: "x1" });
  const hash = computeProofFingerprint([leaf]);
  assert.ok(hash.length === 64); // SHA-256 hex
});

test("computeProofFingerprint only hashes concrete leaves (skips drafts)", () => {
  const concrete = concLeaf({ id: "x1" });
  const draft: TaskNode = { id: "d1", title: "draft", refinement: "draft", intent: "todo", last_status: "draft" };
  const a = computeProofFingerprint([concrete]);
  const b = computeProofFingerprint([concrete, draft]);
  assert.equal(a, b);
});

test("computeProofFingerprint node command can be empty", () => {
  const leaf = concLeaf({ command: "", id: "x1" });
  const hash = computeProofFingerprint([leaf]);
  assert.ok(hash.length === 64);
});
