import * as assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import type { AdversarialGate, DodDocument, TaskNode } from "./types.js";

// This file hosts mocked async checkDocument cases. node:child_process is
// mocked via mock.module, the same pattern checker-vcs.test.ts uses.
// checker.test.ts stays pure and synchronous on purpose. These two cases
// live separately, so the mock lifecycle does not touch its 26 cases.

// ── Test helpers ─────────────────────────────────────────────────────

let nodeCounter = 0;
function nid(): string {
  return `scope-${++nodeCounter}`;
}

function concLeaf(
  id: string,
  title: string,
  command: string,
  desc: string,
  predicate?: Record<string, unknown>,
  extra?: Partial<TaskNode>,
): TaskNode {
  const base: TaskNode = {
    id,
    title,
    refinement: "concrete",
    command,
    predicate: predicate ?? ({ type: "exit_code", value: 0 } as any),
    description: desc,
    last_status: "pending",
  };
  return Object.assign(base, extra);
}

function draftLeaf(id: string, title: string): TaskNode {
  return { id, title, refinement: "draft", intent: `intent for ${title}`, last_status: "draft" };
}

function makeDoc(roots: TaskNode[], overrides?: Partial<DodDocument>): DodDocument {
  return {
    id: "scope-test",
    title: "Scope Test",
    goal: "Test scoped carry-forward and advisory verdict",
    date: "2026-01-01",
    cwd: process.cwd(),
    markdown_path: "/tmp/scope-test.md",
    created_at: "2026-01-01",
    sections: { requirements: "r" },
    roots,
    amendments: [],
    ...overrides,
  };
}

describe("checkDocument scoped carry-forward and advisory verdict", () => {
  before(() => {
    mock.module("node:child_process", {
      namedExports: {
        // Report "not a git repository" so unscoped runs skip VCS/dirty logic
        // entirely and the advisory case is not muddied by pass_dirty downgrade.
        exec: mock.fn(
          (
            _cmd: string,
            _opts: unknown,
            cb: (err: Error | null, result: { stdout: string; stderr: string } | null) => void,
          ) => {
            cb(new Error("fatal: not a git repository"), null);
          },
        ),
        execFile: mock.fn((_cmd: string, args: string[], _opts: unknown, cb: (err: any, result: any) => void) => {
          const joined = Array.isArray(args) ? args.join(" ") : String(args);
          if (joined.includes("advisory-fail-cmd")) {
            cb({ code: 1, stdout: "", stderr: "advisory command failed" }, null);
            return;
          }
          cb(null, { stdout: "", stderr: "" });
        }),
      },
    });
  });

  after(() => {
    mock.reset();
  });

  it("carries forward an out-of-scope leaf's prior status and an out-of-scope draft on a scoped run", async () => {
    const { checkDocument } = await import("./checker.js");

    const inScopeLeaf = concLeaf(nid(), "InScope", "in-scope-cmd", "runs in scope");
    const outOfScopeLeaf = concLeaf(nid(), "OutOfScope", "out-of-scope-cmd", "not touched by this run", undefined, {
      last_status: "fail",
      last_output: "PRIOR-RUN-MARKER",
    });
    const outOfScopeDraft = draftLeaf(nid(), "OutOfScopeDraft");

    const doc = makeDoc([inScopeLeaf, outOfScopeLeaf, outOfScopeDraft]);
    const res = await checkDocument(doc, undefined, { nodePath: "0" });

    const carried = res.leaves.find((l) => l.node_path === "1");
    assert.equal(carried?.status, "fail");
    assert.equal(carried?.output, "PRIOR-RUN-MARKER");

    const carriedDraft = res.leaves.find((l) => l.node_path === "2");
    assert.equal(carriedDraft?.status, "draft");
  });

  it("an advisory leaf's failure does not drag overall away from pass", async () => {
    const { checkDocument } = await import("./checker.js");

    const normalLeaf = concLeaf(nid(), "Normal", "success-cmd", "must pass");
    const advisoryLeaf = concLeaf(nid(), "Advisory", "advisory-fail-cmd", "allowed to fail", undefined, {
      advisory: true,
    });

    const doc = makeDoc([normalLeaf, advisoryLeaf]);
    const res = await checkDocument(doc);

    const advisoryResult = res.leaves.find((l) => l.id === advisoryLeaf.id);
    assert.equal(advisoryResult?.status, "fail");
    assert.notEqual(res.overall, "fail");
  });

  it("an adversarial leaf passes when its phase gate is GO", async () => {
    const { checkDocument } = await import("./checker.js");

    const gatedLeaf = concLeaf(nid(), "Gated", "gate-check-cmd", "checks phase 1 gate", {
      type: "adversarial",
      value: 1,
    });
    const gate: AdversarialGate = {
      phase: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      verdict: "GO",
      lenses: [],
      critical_count: 0,
      major_count: 0,
      minor_count: 0,
      summary: "clean",
    };

    const doc = makeDoc([gatedLeaf], { adversarial_gates: [gate] });
    const res = await checkDocument(doc);

    const gatedResult = res.leaves.find((l) => l.id === gatedLeaf.id);
    assert.equal(gatedResult?.status, "pass");
    assert.equal(res.overall, "pass");
  });

  it("an adversarial leaf fails with no recorded gate", async () => {
    const { checkDocument } = await import("./checker.js");

    const gatedLeaf = concLeaf(nid(), "Ungated", "gate-check-cmd", "checks phase 1 gate", {
      type: "adversarial",
      value: 1,
    });

    const doc = makeDoc([gatedLeaf]);
    const res = await checkDocument(doc);

    const gatedResult = res.leaves.find((l) => l.id === gatedLeaf.id);
    assert.equal(gatedResult?.status, "fail");
    assert.equal(res.overall, "fail");
  });

  it("a scoped group's own draft is not reported in leaves", async () => {
    const { checkDocument } = await import("./checker.js");

    const innerConcrete = concLeaf(nid(), "InnerConcrete", "inner-cmd", "runs inside group");
    const innerDraft = draftLeaf(nid(), "InnerDraft");
    const group: TaskNode = {
      id: nid(),
      title: "Group",
      refinement: "concrete",
      children: [innerConcrete, innerDraft],
      last_status: "pending",
    };

    const doc = makeDoc([group]);
    const res = await checkDocument(doc, undefined, { nodePath: "0" });

    const draftPath = "0.children.1";
    const draftResult = res.leaves.find((l) => l.node_path === draftPath);
    assert.equal(draftResult, undefined);
    const concretePath = "0.children.0";
    const concreteResult = res.leaves.find((l) => l.node_path === concretePath);
    assert.equal(concreteResult?.status, "pass");
  });
});
