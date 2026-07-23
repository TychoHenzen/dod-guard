import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkAmendGate,
  countDraftNodes,
  countNodeAmendments,
  extractExecutableCommands,
  findNodeByPath,
  hasDraftNodes,
  isBranchLocked,
  isExecutablePredicate,
} from "./checker.js";
import type { Amendment, TaskNode } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function draftLeaf(title: string, intent: string): TaskNode {
  return { id: `d-${title}`, title, refinement: "draft", intent, last_status: "draft" };
}

function concLeaf(title: string, command: string, predicate?: TaskNode["predicate"]): TaskNode {
  return {
    id: `c-${title}`,
    title,
    refinement: "concrete",
    command,
    predicate: predicate ?? { type: "exit_code", value: 0 },
    description: title,
    last_status: "pending",
  };
}

function group(title: string, children: TaskNode[]): TaskNode {
  return { id: `g-${title}`, title, refinement: "concrete", children, last_status: "pending" };
}

// ── hasDraftNodes ─────────────────────────────────────────────────────

test("hasDraftNodes true when draft leaf present", () => {
  assert.equal(hasDraftNodes([draftLeaf("todo", "do this")]), true);
});

test("hasDraftNodes false when all concrete", () => {
  assert.equal(hasDraftNodes([concLeaf("build", "npm run build")]), false);
});

test("hasDraftNodes true when group contains draft child", () => {
  const nodes = [group("Core", [concLeaf("build", "npm run build"), draftLeaf("lint", "run linter")])];
  assert.equal(hasDraftNodes(nodes), true);
});

test("hasDraftNodes false when group all concrete", () => {
  const nodes = [group("Core", [concLeaf("build", "npm run build"), concLeaf("test", "npm test")])];
  assert.equal(hasDraftNodes(nodes), false);
});

test("hasDraftNodes empty array returns false", () => {
  assert.equal(hasDraftNodes([]), false);
});

// ── countDraftNodes ───────────────────────────────────────────────────

test("countDraftNodes counts draft leaves", () => {
  assert.equal(countDraftNodes([draftLeaf("a", "a"), draftLeaf("b", "b")]), 2);
});

test("countDraftNodes skips concrete leaves", () => {
  assert.equal(countDraftNodes([concLeaf("x", "echo x"), draftLeaf("y", "y")]), 1);
});

test("countDraftNodes recurses into groups", () => {
  const nodes = [group("G", [draftLeaf("a", "a"), draftLeaf("b", "b")]), draftLeaf("c", "c")];
  assert.equal(countDraftNodes(nodes), 3);
});

test("countDraftNodes empty array returns 0", () => {
  assert.equal(countDraftNodes([]), 0);
});

// ── findNodeByPath ────────────────────────────────────────────────────

test("findNodeByPath root level index", () => {
  const a = draftLeaf("A", "a");
  const b = draftLeaf("B", "b");
  const result = findNodeByPath([a, b], "1");
  assert.equal(result?.title, "B");
});

test("findNodeByPath nested child", () => {
  const nodes = [group("Root", [draftLeaf("Child", "c")])];
  const result = findNodeByPath(nodes, "0.children.0");
  assert.equal(result?.title, "Child");
});

test("findNodeByPath returns null for out of bounds", () => {
  assert.equal(findNodeByPath([draftLeaf("A", "a")], "5"), null);
});

test("findNodeByPath returns null for empty path", () => {
  assert.equal(findNodeByPath([draftLeaf("A", "a")], ""), null);
});

test("findNodeByPath returns null for non-integer segment", () => {
  assert.equal(findNodeByPath([draftLeaf("A", "a")], "foo"), null);
});

test("findNodeByPath deeply nested path", () => {
  const nodes = [group("L1", [group("L2", [group("L3", [concLeaf("Deep", "echo deep")])])])];
  const result = findNodeByPath(nodes, "0.children.0.children.0.children.0");
  assert.equal(result?.title, "Deep");
});

// ── isExecutablePredicate ─────────────────────────────────────────────

test("isExecutablePredicate exit_code is executable", () => {
  assert.equal(isExecutablePredicate("exit_code"), true);
});

test("isExecutablePredicate output_contains is executable", () => {
  assert.equal(isExecutablePredicate("output_contains"), true);
});

test("isExecutablePredicate manual is NOT executable", () => {
  assert.equal(isExecutablePredicate("manual"), false);
});

test("isExecutablePredicate review is NOT executable", () => {
  assert.equal(isExecutablePredicate("review"), false);
});

test("isExecutablePredicate tdd is executable", () => {
  assert.equal(isExecutablePredicate("tdd"), true);
});

test("isExecutablePredicate adversarial is executable", () => {
  assert.equal(isExecutablePredicate("adversarial"), true);
});

// ── extractExecutableCommands ─────────────────────────────────────────

test("extractExecutableCommands returns commands from concrete leaves", () => {
  const nodes = [concLeaf("A", "echo a"), concLeaf("B", "echo b")];
  assert.deepEqual(extractExecutableCommands(nodes), ["echo a", "echo b"]);
});

test("extractExecutableCommands skips drafts", () => {
  const nodes = [draftLeaf("todo", "do this"), concLeaf("Build", "npm run build")];
  assert.deepEqual(extractExecutableCommands(nodes), ["npm run build"]);
});

test("extractExecutableCommands recurses into groups", () => {
  const nodes = [
    group("Core", [concLeaf("lint", "npx biome check"), concLeaf("test", "npm test")]),
    concLeaf("deploy", "npm run deploy"),
  ];
  const cmds = extractExecutableCommands(nodes);
  assert.deepEqual(cmds, ["npx biome check", "npm test", "npm run deploy"]);
});

test("extractExecutableCommands skips manual/review predicates", () => {
  const nodes = [
    concLeaf("manual check", "manual", { type: "manual" }),
    concLeaf("build", "npm run build", { type: "exit_code" }),
  ];
  const cmds = extractExecutableCommands(nodes);
  assert.deepEqual(cmds, ["npm run build"]);
});

test("extractExecutableCommands empty array", () => {
  assert.deepEqual(extractExecutableCommands([]), []);
});

// ── isBranchLocked ────────────────────────────────────────────────────

test("isBranchLocked true when no drafts", () => {
  assert.equal(isBranchLocked([concLeaf("a", "echo a"), concLeaf("b", "echo b")]), true);
});

test("isBranchLocked false when draft present", () => {
  assert.equal(isBranchLocked([concLeaf("a", "echo a"), draftLeaf("todo", "do")]), false);
});

test("isBranchLocked true when group all concrete", () => {
  assert.equal(isBranchLocked([group("G", [concLeaf("a", "echo a")])]), true);
});

// ── countNodeAmendments ───────────────────────────────────────────────

test("countNodeAmendments counts modified/refined amendments", () => {
  const amendments: Amendment[] = [
    { node_path: "0", action: "modified", reason: "changed", timestamp: "2026-01-01" },
    { node_path: "0", action: "refined", reason: "refined", timestamp: "2026-01-02" },
    { node_path: "0", action: "added", reason: "new", timestamp: "2026-01-03" },
  ];
  assert.equal(countNodeAmendments(amendments, "0"), 2);
});

test("countNodeAmendments zero for untouched node", () => {
  assert.equal(countNodeAmendments([], "0"), 0);
});

test("countNodeAmendments only counts matching path", () => {
  const amendments: Amendment[] = [
    { node_path: "0", action: "modified", reason: "x", timestamp: "2026-01-01" },
    { node_path: "1", action: "modified", reason: "y", timestamp: "2026-01-01" },
  ];
  assert.equal(countNodeAmendments(amendments, "0"), 1);
});

// ── checkAmendGate ────────────────────────────────────────────────────

test("checkAmendGate allows 0 amendments", () => {
  assert.equal(checkAmendGate([], "0"), null);
});

test("checkAmendGate allows 2 amendments", () => {
  const amendments: Amendment[] = [
    { node_path: "0", action: "modified", reason: "a", timestamp: "t1" },
    { node_path: "0", action: "modified", reason: "b", timestamp: "t2" },
  ];
  assert.equal(checkAmendGate(amendments, "0"), null);
});

test("checkAmendGate blocks 3 amendments without justification", () => {
  const amendments: Amendment[] = [
    { node_path: "0", action: "modified", reason: "a", timestamp: "t1" },
    { node_path: "0", action: "modified", reason: "b", timestamp: "t2" },
    { node_path: "0", action: "refined", reason: "c", timestamp: "t3" },
  ];
  const result = checkAmendGate(amendments, "0");
  assert.ok(result);
  assert.ok(result.includes("3 times"));
});

test("checkAmendGate allows 3 amendments with justification", () => {
  const amendments: Amendment[] = [
    { node_path: "0", action: "modified", reason: "a", timestamp: "t1" },
    { node_path: "0", action: "modified", reason: "b", timestamp: "t2" },
    { node_path: "0", action: "refined", reason: "c", timestamp: "t3" },
  ];
  assert.equal(checkAmendGate(amendments, "0", "requirements changed"), null);
});

test("checkAmendGate allows 4+ amendments with justification", () => {
  const amendments: Amendment[] = [
    { node_path: "0", action: "modified", reason: "a", timestamp: "t1" },
    { node_path: "0", action: "modified", reason: "b", timestamp: "t2" },
    { node_path: "0", action: "refined", reason: "c", timestamp: "t3" },
    { node_path: "0", action: "modified", reason: "d", timestamp: "t4" },
  ];
  assert.equal(checkAmendGate(amendments, "0", "ongoing iteration"), null);
});
