import * as assert from "node:assert/strict";
import { after, before, describe, it, mock } from "node:test";
import type { DodDocument, TaskNode } from "./types.js";

// ── Test helpers ─────────────────────────────────────────────────────

let nodeCounter = 0;
function nid(): string {
  return `vcs-${++nodeCounter}`;
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

function makeDoc(roots: TaskNode[], overrides?: Partial<DodDocument>): DodDocument {
  return {
    id: "vcs-test",
    title: "VCS Test",
    goal: "Test VCS state capture",
    date: "2026-01-01",
    cwd: process.cwd(),
    markdown_path: "/tmp/vcs-test.md",
    created_at: "2026-01-01",
    sections: { requirements: "r" },
    roots,
    amendments: [],
    ...overrides,
  };
}

// ── VCS state capture tests ──────────────────────────────────────────

describe("checkDocument VCS state capture", () => {
  let mockDirty = false;
  let mockGitFails = false;

  before(() => {
    mock.module("node:child_process", {
      namedExports: {
        exec: mock.fn(
          (
            cmd: string,
            _opts: unknown,
            cb: (err: Error | null, result: { stdout: string; stderr: string } | null) => void,
          ) => {
            if (mockGitFails && cmd.startsWith("git")) {
              cb(new Error("fatal: not a git repository"), null);
              return;
            }
            if (cmd.startsWith("git rev-parse")) {
              cb(null, { stdout: "deadbeef1234567890abcdef1234567890abcdef12\n", stderr: "" });
              return;
            }
            if (cmd.startsWith("git status")) {
              cb(null, { stdout: mockDirty ? " M src/index.ts\n" : "", stderr: "" });
              return;
            }
            // Default: non-git commands succeed (exit 0 for proof commands)
            cb(null, { stdout: "", stderr: "" });
          },
        ),
        execFile: mock.fn(
          (
            _cmd: string,
            _args: string[],
            _opts: unknown,
            cb: (err: Error | null, result: { stdout: string; stderr: string } | null) => void,
          ) => {
            // Default: non-git commands succeed
            cb(null, { stdout: "", stderr: "" });
          },
        ),
      },
    });
  });

  after(() => {
    mock.reset();
  });

  it("captures commit and clean state on full check", async () => {
    mockDirty = false;
    mockGitFails = false;
    const { checkDocument } = await import("./checker.js");
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass");
    assert.equal(res.checked_commit, "deadbeef1234567890abcdef1234567890abcdef12");
    assert.equal(res.checked_dirty, false);
    assert.equal(res.is_git_repo, true);
  });

  it("downgrades to pass_dirty when tree is dirty", async () => {
    mockDirty = true;
    mockGitFails = false;
    const { checkDocument } = await import("./checker.js");
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass_dirty");
    assert.equal(res.checked_dirty, true);
  });

  it("handles non-git directory gracefully", async () => {
    mockDirty = false;
    mockGitFails = true;
    const { checkDocument } = await import("./checker.js");
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass");
    assert.equal(res.is_git_repo, false);
    assert.equal(res.checked_commit, undefined);
    assert.equal(res.checked_dirty, undefined);
  });

  it("allow_dirty_pass=true keeps PASS when dirty", async () => {
    mockDirty = true;
    mockGitFails = false;
    const { checkDocument } = await import("./checker.js");
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { allow_dirty_pass: true });
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass");
    assert.equal(res.checked_dirty, true);
  });

  it("dirty tree + allow_dirty_pass shows fallback note in guidance", async () => {
    mockDirty = true;
    mockGitFails = false;
    const { checkDocument } = await import("./checker.js");
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { allow_dirty_pass: true });
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass");
    assert.equal(res.checked_commit, "deadbeef1234567890abcdef1234567890abcdef12");
    assert.equal(res.checked_dirty, true);
    // Summary should contain the dirty-tree fallback note
    assert.ok(res.summary.includes("dirty tree"), "guidance should mention dirty tree fallback");
  });

  it("scoped run skips VCS capture", async () => {
    mockDirty = false;
    mockGitFails = false;
    const { checkDocument } = await import("./checker.js");
    const child = concLeaf(nid(), "c", "exit 0", "child");
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "concrete",
      children: [child],
      last_status: "pending",
    };
    const doc = makeDoc([group]);
    const res = await checkDocument(doc, undefined, { nodePath: "0.children.0" });
    assert.equal(res.overall, "incomplete");
    assert.equal(res.scoped, true);
    assert.equal(res.is_git_repo, undefined);
    assert.equal(res.checked_commit, undefined);
    assert.equal(res.checked_dirty, undefined);
  });
});
