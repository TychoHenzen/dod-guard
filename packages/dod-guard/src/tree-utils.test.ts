import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  buildTaskNodes,
  countAllNodes,
  findNodeById,
  findNodeInTree,
  formatTree,
  nextNodeId,
  resetNodeIdCounter,
} from "./tree-utils.js";
import type { TaskNode } from "./types.js";

beforeEach(() => {
  resetNodeIdCounter();
});

// ── nextNodeId ─────────────────────────────────────────────────────────

test("nextNodeId produces sequential IDs", () => {
  assert.equal(nextNodeId(), "node-1");
  assert.equal(nextNodeId(), "node-2");
  assert.equal(nextNodeId(), "node-3");
});

test("resetNodeIdCounter restarts from 1", () => {
  nextNodeId();
  nextNodeId();
  resetNodeIdCounter();
  assert.equal(nextNodeId(), "node-1");
});

// ── buildTaskNodes ─────────────────────────────────────────────────────

test("buildTaskNodes creates draft leaf", () => {
  const nodes = buildTaskNodes([{ title: "Check auth", refinement: "draft", intent: "verify login works" }]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].title, "Check auth");
  assert.equal(nodes[0].refinement, "draft");
  assert.equal(nodes[0].intent, "verify login works");
  assert.equal(nodes[0].last_status, "draft");
});

test("buildTaskNodes creates concrete leaf", () => {
  const nodes = buildTaskNodes([
    {
      title: "Build passes",
      refinement: "concrete",
      command: "npm run build",
      predicate: { type: "exit_code", value: 0 },
      description: "build must succeed",
      category: "behavioral",
    },
  ]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].title, "Build passes");
  assert.equal(nodes[0].refinement, "concrete");
  assert.equal(nodes[0].command, "npm run build");
  assert.equal(nodes[0].last_status, "pending");
});

test("buildTaskNodes creates task group with children", () => {
  const nodes = buildTaskNodes([
    {
      title: "Core checks",
      children: [
        { title: "Lint clean", intent: "no lint errors" },
        { title: "Tests pass", intent: "all tests green" },
      ],
    },
  ]);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].title, "Core checks");
  assert.equal(nodes[0].refinement, "concrete"); // groups are concrete
  assert.ok(nodes[0].children);
  assert.equal(nodes[0].children?.length, 2);
});

test("buildTaskNodes nested groups", () => {
  const nodes = buildTaskNodes([
    {
      title: "Root",
      children: [
        {
          title: "Subgroup",
          children: [{ title: "Deep leaf", intent: "deep check" }],
        },
      ],
    },
  ]);
  assert.equal(nodes[0].children?.[0].children?.[0].title, "Deep leaf");
});

test("buildTaskNodes advisory flag", () => {
  const nodes = buildTaskNodes([
    {
      title: "Nice to have",
      refinement: "concrete",
      command: "npm run lint",
      predicate: { type: "exit_code" },
      description: "optional lint check",
      advisory: true,
    },
  ]);
  assert.equal(nodes[0].advisory, true);
});

// ── findNodeInTree ─────────────────────────────────────────────────────

function sampleTree(): TaskNode[] {
  return buildTaskNodes([
    {
      title: "Root A",
      children: [
        { title: "Leaf A1", intent: "check A1" },
        { title: "Leaf A2", intent: "check A2" },
      ],
    },
    { title: "Root B", intent: "check B" },
  ]);
}

test("findNodeInTree finds by ID in roots", () => {
  const tree = sampleTree();
  const target = tree[1]; // Root B
  assert.ok(target.id);
  const found = findNodeInTree(tree, target.id);
  assert.equal(found?.title, "Root B");
});

test("findNodeInTree finds nested child by ID", () => {
  const tree = sampleTree();
  const rootA = tree[0];
  assert.ok(rootA.children);
  const leafA2 = rootA.children?.[1];
  const found = findNodeInTree(tree, leafA2.id);
  assert.equal(found?.title, "Leaf A2");
});

test("findNodeInTree returns null for unknown ID", () => {
  assert.equal(findNodeInTree(sampleTree(), "nonexistent"), null);
});

// ── findNodeById ──────────────────────────────────────────────────────

test("findNodeById returns node and path", () => {
  const tree = sampleTree();
  const target = tree[0].children?.[0];
  const result = findNodeById(tree, target.id);
  assert.ok(result);
  assert.equal(result.node.title, "Leaf A1");
  assert.equal(result.path, "0.children.0");
});

test("findNodeById returns null for unknown ID", () => {
  assert.equal(findNodeById(sampleTree(), "nope"), null);
});

// ── countAllNodes ─────────────────────────────────────────────────────

test("countAllNodes flat list", () => {
  const nodes = buildTaskNodes([
    { title: "a", intent: "a" },
    { title: "b", intent: "b" },
    { title: "c", intent: "c" },
  ]);
  assert.equal(countAllNodes(nodes), 3);
});

test("countAllNodes with groups", () => {
  const nodes = buildTaskNodes([
    {
      title: "Group",
      children: [
        { title: "x", intent: "x" },
        { title: "y", intent: "y" },
      ],
    },
  ]);
  // Group node + 2 children = 3
  assert.equal(countAllNodes(nodes), 3);
});

// ── formatTree ────────────────────────────────────────────────────────

test("formatTree shows node count summary", () => {
  const nodes = buildTaskNodes([
    { title: "a", intent: "a" },
    { title: "b", intent: "b" },
  ]);
  const out = formatTree(nodes);
  assert.ok(out.includes("2 nodes"));
  assert.ok(out.includes("0 concrete"));
  assert.ok(out.includes("2 draft"));
});

test("formatTree shows concrete count", () => {
  const nodes = buildTaskNodes([
    {
      title: "Check",
      refinement: "concrete",
      command: "echo ok",
      predicate: { type: "exit_code" },
      description: "ok",
    },
  ]);
  const out = formatTree(nodes);
  assert.ok(out.includes("1 concrete"));
});

test("formatTree shows title", () => {
  const out = formatTree([], { title: "My DoD" });
  assert.ok(out.includes("My DoD"));
});

test("formatTree shows PROOF for concrete leaf", () => {
  const nodes = buildTaskNodes([
    {
      title: "Build check",
      refinement: "concrete",
      command: "npm run build",
      predicate: { type: "exit_code" },
      description: "build passes",
      category: "behavioral",
    },
  ]);
  const out = formatTree(nodes);
  assert.ok(out.includes("PROOF:"));
  assert.ok(out.includes("behavioral"));
});

test("formatTree shows DRAFT for draft leaf", () => {
  const nodes = buildTaskNodes([{ title: "Todo item", refinement: "draft", intent: "do this later" }]);
  const out = formatTree(nodes);
  assert.ok(out.includes("DRAFT:"));
  assert.ok(out.includes("do this later"));
});

test("formatTree shows GROUP for task group", () => {
  const nodes = buildTaskNodes([
    {
      title: "Core",
      children: [{ title: "Leaf", intent: "sub item" }],
    },
  ]);
  const out = formatTree(nodes);
  assert.ok(out.includes("GROUP:"));
  assert.ok(out.includes("Core"));
});

test("formatTree scoped by path", () => {
  const nodes = buildTaskNodes([
    {
      title: "Root",
      children: [
        { title: "Child A", intent: "a" },
        { title: "Child B", intent: "b" },
      ],
    },
  ]);
  const out = formatTree(nodes, { scopePath: "0" });
  assert.ok(out.includes("Child A"));
  assert.ok(out.includes("Child B"));
  assert.ok(out.includes("scoped"));
});

test("formatTree scoped by ID", () => {
  const nodes = buildTaskNodes([
    {
      title: "Root",
      children: [{ title: "Child A", intent: "a" }],
    },
  ]);
  const rootId = nodes[0].id;
  assert.ok(rootId);
  const out = formatTree(nodes, { scopeId: rootId });
  assert.ok(out.includes("Child A"));
  assert.ok(out.includes("scoped"));
});

test("formatTree scoped to nonexistent path returns error", () => {
  const out = formatTree([], { scopePath: "99" });
  assert.ok(out.startsWith("ERROR"));
});

test("formatTree scoped to nonexistent ID returns error", () => {
  const out = formatTree([], { scopeId: "nope" });
  assert.ok(out.startsWith("ERROR"));
});
