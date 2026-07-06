import { describe, it, before } from "node:test";
import * as assert from "node:assert/strict";
import { checkDocument, parseSurvivors, computeProofFingerprint, flattenConcreteLeaves, hasDraftNodes, findNodeByPath, countDraftNodes } from "./checker.js";
import { perProofFingerprint } from "./manual.js";
import type { DodDocument, TaskNode } from "./types.js";

// ── Test helpers ─────────────────────────────────────────────────────

type Pred = TaskNode["predicate"];

let nodeId = 0;
function nid(): string { return `n${++nodeId}`; }

function draftLeaf(id: string, title: string, intent: string): TaskNode {
  return { id, title, refinement: "draft", intent, last_status: "draft" };
}

function concLeaf(id: string, title: string, command: string, desc: string, predicate?: Pred, extra?: Partial<TaskNode>): TaskNode {
  const base: TaskNode = {
    id, title, refinement: "concrete",
    command, predicate: predicate ?? { type: "exit_code", value: 0 },
    description: desc, last_status: "pending",
  };
  return Object.assign(base, extra);
}

function manualLeaf(id: string, title: string, desc: string, extra?: Partial<TaskNode>): TaskNode {
  return concLeaf(id, title, "manual", desc, { type: "manual" }, extra);
}

function groupNode(id: string, title: string, children: TaskNode[]): TaskNode {
  return { id, title, refinement: "concrete", children, last_status: "draft" };
}

function makeDoc(roots: TaskNode[], overrides?: Partial<DodDocument>): DodDocument {
  return {
    id: "test-doc", title: "Test", goal: "Test",
    date: "2026-01-01", cwd: process.cwd(), markdown_path: "/tmp/X",
    created_at: "2026-01-01",
    sections: { requirements: "r" },
    roots,
    amendments: [],
    ...overrides,
  };
}

before(() => { nodeId = 0; });

// ── Tree utilities ────────────────────────────────────────────────────

describe("flattenConcreteLeaves", () => {
  it("returns concrete leaves with paths", () => {
    const leaves = flattenConcreteLeaves([
      concLeaf(nid(), "a", "exit 0", "test a"),
      concLeaf(nid(), "b", "exit 0", "test b"),
    ]);
    assert.equal(leaves.length, 2);
    assert.equal(leaves[0].node_path, "0");
    assert.equal(leaves[1].node_path, "1");
  });

  it("skips draft leaves", () => {
    const leaves = flattenConcreteLeaves([
      concLeaf(nid(), "a", "exit 0", "test"),
      draftLeaf(nid(), "b", "draft only"),
    ]);
    assert.equal(leaves.length, 1);
  });

  it("recurses into task groups", () => {
    const leaves = flattenConcreteLeaves([
      groupNode(nid(), "group", [
        concLeaf(nid(), "child", "exit 0", "test"),
      ]),
    ]);
    assert.equal(leaves.length, 1);
    assert.ok(leaves[0].node_path.includes("children.0"));
  });

  it("returns empty for all-draft tree", () => {
    const leaves = flattenConcreteLeaves([
      draftLeaf(nid(), "a", "intent a"),
      draftLeaf(nid(), "b", "intent b"),
    ]);
    assert.equal(leaves.length, 0);
  });
});

describe("hasDraftNodes", () => {
  it("detects draft leaves", () => {
    assert.equal(hasDraftNodes([draftLeaf(nid(), "a", "intent")]), true);
  });

  it("detects nested drafts", () => {
    assert.equal(hasDraftNodes([
      groupNode(nid(), "g", [draftLeaf(nid(), "a", "intent")]),
    ]), true);
  });

  it("returns false for all-concrete", () => {
    assert.equal(hasDraftNodes([concLeaf(nid(), "a", "exit 0", "x")]), false);
  });
});

describe("findNodeByPath", () => {
  it("finds root-level node", () => {
    const node = concLeaf("findme", "a", "exit 0", "x");
    assert.equal(findNodeByPath([node], "0"), node);
  });

  it("finds nested node", () => {
    const child = concLeaf("child", "c", "exit 0", "x");
    const root = groupNode("root", "g", [child]);
    assert.equal(findNodeByPath([root], "0.children.0"), child);
  });

  it("returns null for bad path", () => {
    assert.equal(findNodeByPath([concLeaf("x", "a", "e", "d")], "99"), null);
  });
});

// ── Fingerprint ───────────────────────────────────────────────────────

describe("computeProofFingerprint", () => {
  it("empty for all-draft tree", () => {
    assert.equal(computeProofFingerprint([draftLeaf(nid(), "a", "i")]), "");
  });

  it("hashes concrete leaves", () => {
    const fp = computeProofFingerprint([concLeaf(nid(), "a", "echo x", "t")]);
    assert.ok(fp.length > 0);
  });

  it("changes when command changes", () => {
    const r: TaskNode[] = [concLeaf(nid(), "a", "cmd1", "t")];
    const fp1 = computeProofFingerprint(r);
    r[0].command = "cmd2";
    assert.notEqual(fp1, computeProofFingerprint(r));
  });

  it("includes advisory in hash", () => {
    const fp1 = computeProofFingerprint([concLeaf(nid(), "a", "e", "t")]);
    const fp2 = computeProofFingerprint([concLeaf(nid(), "a", "e", "t", undefined, { advisory: true })]);
    assert.notEqual(fp1, fp2);
  });
});

// ── checkDocument: drafts ─────────────────────────────────────────────

describe("checkDocument drafts", () => {
  it("incomplete when drafts present", async () => {
    const doc = makeDoc([
      concLeaf(nid(), "a", "exit 0", "ok"),
      draftLeaf(nid(), "b", "pending"),
    ]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "incomplete");
    assert.equal(res.draft_count, 1);
  });

  it("reports draft leaves as status draft", async () => {
    const doc = makeDoc([draftLeaf(nid(), "a", "intent")]);
    const res = await checkDocument(doc);
    const d = res.leaves.find(l => l.status === "draft");
    assert.ok(d);
    assert.ok(d.output?.includes("DRAFT"));
  });

  it("pass when all concrete and no drafts", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass");
  });
});

// ── checkDocument: execution ──────────────────────────────────────────

describe("checkDocument execution", () => {
  it("exit_code 0 passes", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "ok")]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass");
  });

  it("exit_code mismatch fails", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 1", "fail", { type: "exit_code", value: 0 })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail");
  });

  it("output_contains matches", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hello", "t", { type: "output_contains", value: "hello" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass");
  });

  it("output_contains mismatch fails", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hi", "t", { type: "output_contains", value: "world" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail");
  });
});

// ── checkDocument: manual ─────────────────────────────────────────────

describe("checkDocument manual", () => {
  it("skipped when unverified", async () => {
    const doc = makeDoc([manualLeaf(nid(), "m", "check")]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "skipped");
  });

  it("pass when verified with matching fingerprint", async () => {
    const n = manualLeaf(nid(), "m", "check");
    n.manual_result = { answer: "pass", confirmed_at: new Date().toISOString(), channel: "elicitation", proof_fingerprint: perProofFingerprint(n) };
    assert.equal((await checkDocument(makeDoc([n]))).leaves[0].status, "pass");
  });
});

// ── parseSurvivors ────────────────────────────────────────────────────

describe("parseSurvivors", () => {
  it("cargo-mutants", () => {
    assert.equal(parseSurvivors("152 missed"), 152);
    assert.equal(parseSurvivors("0 missed"), 0);
  });
  it("mutmut", () => { assert.equal(parseSurvivors("Survived 🙁 (5)"), 5); });
  it("unrecognized", () => { assert.equal(parseSurvivors("garbage"), null); });
});

// ── checkDocument: TDD ────────────────────────────────────────────────

describe("checkDocument TDD", () => {
  it("fails without prior red", async () => {
    const doc = makeDoc([concLeaf(nid(), "t", "exit 0", "tdd", { type: "tdd", value: 0 })]);
    const r = await checkDocument(doc);
    assert.equal(r.leaves[0].status, "fail");
    assert.ok(r.leaves[0].error?.includes("TDD VIOLATION"));
  });

  it("records seen_failing on red", async () => {
    const n = concLeaf(nid(), "t", "exit 1", "tdd", { type: "tdd", value: 0 });
    await checkDocument(makeDoc([n]));
    assert.equal(n.seen_failing, true);
  });

  it("passes after red→green", async () => {
    const n = concLeaf(nid(), "t", "exit 0", "tdd", { type: "tdd", value: 0 });
    n.seen_failing = true; n.seen_failing_at = new Date().toISOString();
    assert.equal((await checkDocument(makeDoc([n]))).leaves[0].status, "pass");
  });
});

// ── Scoped run ────────────────────────────────────────────────────────

describe("checkDocument scoped", () => {
  it("incomplete for subtree scope", async () => {
    const g = groupNode(nid(), "g", [concLeaf(nid(), "a", "exit 0", "ok")]);
    const r = await checkDocument(makeDoc([g]), undefined, { nodePath: "0.children.0" });
    assert.equal(r.overall, "incomplete");
    assert.equal(r.scoped, true);
  });
});

// ── Advisory ──────────────────────────────────────────────────────────

describe("checkDocument advisory", () => {
  it("advisory fail does not block", async () => {
    const doc = makeDoc([
      concLeaf(nid(), "a", "exit 0", "ok"),
      concLeaf(nid(), "adv", "exit 1", "warn", { type: "exit_code", value: 0 }, { advisory: true }),
    ]);
    assert.equal((await checkDocument(doc)).overall, "pass");
  });

  it("hard fail blocks overall", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 1", "fail", { type: "exit_code", value: 0 })]);
    assert.equal((await checkDocument(doc)).overall, "fail");
  });
});
