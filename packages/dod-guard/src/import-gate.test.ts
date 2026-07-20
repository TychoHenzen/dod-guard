import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImportGateInfo } from "./index.js";
import type { DodDocument, TaskNode } from "./types.js";

// ── Helpers ─────────────────────────────────────────────────────────────

function leaf(id: string, title: string, command: string, desc: string, predicateType: string = "exit_code"): TaskNode {
  return {
    id,
    title,
    refinement: "concrete",
    command,
    predicate: { type: predicateType as any, value: 0 },
    description: desc,
    last_status: "pending",
  };
}

function draftLeaf(id: string, title: string, intent: string): TaskNode {
  return { id, title, refinement: "draft", intent, last_status: "draft" };
}

function makeDoc(overrides?: Partial<DodDocument>): DodDocument {
  return {
    id: "test-doc",
    title: "Test",
    goal: "Test",
    date: "2026-01-01",
    cwd: "/tmp",
    markdown_path: "/tmp/X.md",
    created_at: "2026-01-01T00:00:00.000Z",
    sections: { requirements: "r" },
    roots: [],
    amendments: [],
    ...overrides,
  };
}

// ── buildImportGateInfo tests ───────────────────────────────────────────

describe("buildImportGateInfo", () => {
  it("returns blocked:false for author-created DoDs (no import_source)", () => {
    const doc = makeDoc({
      execution_confirmed: true,
      roots: [leaf("n1", "Lint", "npx biome check", "Run linter")],
    });
    const result = buildImportGateInfo(doc);
    assert.equal(result.blocked, false);
  });

  it("returns blocked:false for imported DoDs that have been confirmed", () => {
    const doc = makeDoc({
      import_source: "/tmp/imported.md",
      execution_confirmed: true,
      roots: [leaf("n1", "Lint", "npx biome check", "Run linter")],
    });
    const result = buildImportGateInfo(doc);
    assert.equal(result.blocked, false);
  });

  it("returns blocked:false for docs with no import_source and no execution_confirmed", () => {
    // Legacy docs that lack both fields should not be blocked
    const doc = makeDoc({
      roots: [leaf("n1", "Lint", "npx biome check", "Run linter")],
    });
    const result = buildImportGateInfo(doc);
    assert.equal(result.blocked, false);
  });

  it("returns blocked:true with command list for unconfirmed imported DoD", () => {
    const doc = makeDoc({
      import_source: "/tmp/imported.md",
      execution_confirmed: false,
      roots: [leaf("n1", "Lint", "npx biome check", "Run linter"), leaf("n2", "Test", "npm test", "Run test suite")],
    });
    const result = buildImportGateInfo(doc);
    assert.ok(result.blocked);
    if (result.blocked) {
      assert.equal(result.executableCount, 2);
      assert.equal(result.commandList.length, 2);
      assert.deepEqual(result.commandList[0], {
        title: "Lint",
        command: "npx biome check",
        description: "Run linter",
      });
      assert.deepEqual(result.commandList[1], {
        title: "Test",
        command: "npm test",
        description: "Run test suite",
      });
    }
  });

  it("excludes manual/review predicates from command list", () => {
    const doc = makeDoc({
      import_source: "/tmp/imported.md",
      execution_confirmed: false,
      roots: [
        leaf("n1", "Lint", "npx biome check", "Run linter"),
        leaf("n2", "Manual check", "manual", "Visual check", "manual"),
        leaf("n3", "Review", "review", "Code review", "review"),
      ],
    });
    const result = buildImportGateInfo(doc);
    assert.ok(result.blocked);
    if (result.blocked) {
      assert.equal(result.executableCount, 1);
      assert.equal(result.commandList[0].command, "npx biome check");
    }
  });

  it("excludes draft nodes from command list", () => {
    const doc = makeDoc({
      import_source: "/tmp/imported.md",
      execution_confirmed: false,
      roots: [
        leaf("n1", "Lint", "npx biome check", "Run linter"),
        draftLeaf("n2", "Not ready", "Will add tests later"),
      ],
    });
    const result = buildImportGateInfo(doc);
    assert.ok(result.blocked);
    if (result.blocked) {
      assert.equal(result.executableCount, 1);
      assert.equal(result.commandList.length, 1);
    }
  });

  it("includes task group children in command list", () => {
    const doc = makeDoc({
      import_source: "/tmp/imported.md",
      execution_confirmed: false,
      roots: [
        {
          id: "g1",
          title: "Quality checks",
          refinement: "concrete",
          last_status: "pending",
          children: [
            leaf("n1", "Lint", "npx biome check", "Run linter"),
            leaf("n2", "Format", "npx biome format", "Check formatting"),
          ],
        },
      ],
    });
    const result = buildImportGateInfo(doc);
    assert.ok(result.blocked);
    if (result.blocked) {
      assert.equal(result.executableCount, 2);
      assert.equal(result.commandList.length, 2);
    }
  });

  it("returns executableCount 0 when no executable leaves exist", () => {
    const doc = makeDoc({
      import_source: "/tmp/imported.md",
      execution_confirmed: false,
      roots: [leaf("n1", "Manual", "manual", "Visual check", "manual"), draftLeaf("n2", "Draft", "Not ready")],
    });
    const result = buildImportGateInfo(doc);
    assert.ok(result.blocked);
    if (result.blocked) {
      assert.equal(result.executableCount, 0);
      assert.equal(result.commandList.length, 0);
    }
  });
});
