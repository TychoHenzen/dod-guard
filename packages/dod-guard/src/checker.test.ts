import * as assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  checkAmendGate,
  checkDocument,
  countDraftNodes,
  countNodeAmendments,
  detectStrengthReduction,
  extractExecutableCommands,
  findNodeByPath,
  hasDraftNodes,
  isExecutablePredicate,
  parseSurvivors,
} from "./checker.js";
import { computeProofFingerprint, flattenConcreteLeaves } from "./fingerprint.js";
import { perProofFingerprint } from "./manual.js";
import { countAllNodes, findNodeById, formatTree } from "./tree-utils.js";
import type { DodDocument, Predicate, TaskNode } from "./types.js";

// ── Test helpers ─────────────────────────────────────────────────────

type Pred = TaskNode["predicate"];

/** Injectable exec for fast, deterministic tests — no real subprocess. */
function fakeExec(
  output: string,
  exitCode = 0,
): (
  cmd: string,
  cwd: string,
) => Promise<{
  exitCode: number;
  combined: string;
  duration: number;
}> {
  return async (_cmd, _cwd) => ({
    exitCode,
    combined: output,
    duration: 0,
  });
}

const _DEADBEEF_ID = "deadbeef-dead-beef-dead-beefdeadbeef";

/** Create per-describe-block scoped helpers for generating unique IDs. */
function scope() {
  let nodeId = 0;
  function nid(): string {
    return `n${++nodeId}`;
  }
  return { nid };
}

function draftLeaf(id: string, title: string, intent: string): TaskNode {
  return { id, title, refinement: "draft", intent, last_status: "draft" };
}

function concLeaf(
  id: string,
  title: string,
  command: string,
  desc: string,
  predicate?: Pred,
  extra?: Partial<TaskNode>,
): TaskNode {
  const base: TaskNode = {
    id,
    title,
    refinement: "concrete",
    command,
    predicate: predicate ?? { type: "exit_code", value: 0 },
    description: desc,
    last_status: "pending",
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
    id: "test-doc",
    title: "Test",
    goal: "Test",
    date: "2026-01-01",
    cwd: process.cwd(),
    markdown_path: "/tmp/X",
    created_at: "2026-01-01",
    sections: { requirements: "r" },
    roots,
    amendments: [],
    ...overrides,
  };
}

// ── Tree utilities ────────────────────────────────────────────────────

describe("flattenConcreteLeaves", () => {
  const { nid } = scope();

  it("returns concrete leaves with paths", () => {
    const leaves = flattenConcreteLeaves([
      concLeaf(nid(), "a", "exit 0", "test a"),
      concLeaf(nid(), "b", "exit 0", "test b"),
    ]);
    assert.equal(leaves.length, 2, "should return both concrete leaves");
    assert.equal(leaves[0].node_path, "0", "first leaf path should be 0");
    assert.equal(leaves[1].node_path, "1", "second leaf path should be 1");
  });

  it("skips draft leaves", () => {
    const leaves = flattenConcreteLeaves([concLeaf(nid(), "a", "exit 0", "test"), draftLeaf(nid(), "b", "draft only")]);
    assert.equal(leaves.length, 1, "draft leaves should be skipped");
  });

  it("recurses into task groups", () => {
    const leaves = flattenConcreteLeaves([groupNode(nid(), "group", [concLeaf(nid(), "child", "exit 0", "test")])]);
    assert.equal(leaves.length, 1, "should recurse into group children");
    assert.ok(leaves[0].node_path.includes("children.0"), "path should include children segment");
  });

  it("returns empty for all-draft tree", () => {
    const leaves = flattenConcreteLeaves([draftLeaf(nid(), "a", "intent a"), draftLeaf(nid(), "b", "intent b")]);
    assert.equal(leaves.length, 0, "all-draft tree should produce no concrete leaves");
  });

  it("recurses into task group even when refinement=draft", () => {
    // Task groups are structural — refinement only applies to leaves.
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "draft",
      children: [concLeaf(nid(), "child", "exit 0", "test")],
      last_status: "draft",
    };
    const leaves = flattenConcreteLeaves([group]);
    assert.equal(leaves.length, 1, "should recurse into group regardless of its refinement");
    assert.ok(leaves[0].node_path.includes("children.0"), "path should include children segment");
  });
});

describe("hasDraftNodes", () => {
  const { nid } = scope();

  it("detects draft leaves", () => {
    assert.equal(hasDraftNodes([draftLeaf(nid(), "a", "intent")]), true, "should detect a draft leaf");
  });

  it("detects nested drafts", () => {
    assert.equal(
      hasDraftNodes([groupNode(nid(), "g", [draftLeaf(nid(), "a", "intent")])]),
      true,
      "should detect drafts nested inside groups",
    );
  });

  it("returns false for all-concrete", () => {
    assert.equal(
      hasDraftNodes([concLeaf(nid(), "a", "exit 0", "x")]),
      false,
      "all-concrete tree should have no drafts",
    );
  });

  it("does not count task group itself as draft even if refinement=draft", () => {
    // Task groups are structural — refinement only applies to leaves.
    // A group with refinement="draft" and concrete children has no draft leaves.
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "draft",
      children: [concLeaf(nid(), "a", "exit 0", "desc")],
      last_status: "draft",
    };
    assert.equal(hasDraftNodes([group]), false, "task group with concrete children should have no drafts");
  });

  it("detects draft leaves inside group even when group refinement=draft", () => {
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "draft",
      children: [draftLeaf(nid(), "a", "intent")],
      last_status: "draft",
    };
    assert.equal(hasDraftNodes([group]), true, "should detect draft children inside task group");
  });
});

describe("findNodeByPath", () => {
  it("finds root-level node", () => {
    const node = concLeaf("findme", "a", "exit 0", "x");
    assert.equal(findNodeByPath([node], "0"), node, "should find by path 0");
  });

  it("finds nested node", () => {
    const child = concLeaf("child", "c", "exit 0", "x");
    const root = groupNode("root", "g", [child]);
    assert.equal(findNodeByPath([root], "0.children.0"), child, "should find nested child");
  });

  it("returns null for bad path", () => {
    assert.equal(findNodeByPath([concLeaf("x", "a", "e", "d")], "99"), null, "bad path should return null");
  });
});

// ── countDraftNodes ────────────────────────────────────────────────────

describe("countDraftNodes", () => {
  const { nid } = scope();

  it("returns 0 for all-concrete tree", () => {
    assert.equal(countDraftNodes([concLeaf(nid(), "a", "exit 0", "x")]), 0, "all-concrete should have zero drafts");
  });

  it("counts single draft leaf", () => {
    assert.equal(countDraftNodes([draftLeaf(nid(), "a", "intent")]), 1, "single draft leaf should count as 1");
  });

  it("counts mixed tree", () => {
    assert.equal(
      countDraftNodes([concLeaf(nid(), "a", "exit 0", "x"), draftLeaf(nid(), "b", "intent")]),
      1,
      "one draft in mixed tree should count as 1",
    );
  });

  it("counts nested drafts in group", () => {
    assert.equal(
      countDraftNodes([groupNode(nid(), "g", [concLeaf(nid(), "a", "exit 0", "x"), draftLeaf(nid(), "b", "intent")])]),
      1,
      "nested draft in group should be counted",
    );
  });

  it("counts multiple drafts", () => {
    assert.equal(
      countDraftNodes([draftLeaf(nid(), "a", "intent a"), draftLeaf(nid(), "b", "intent b")]),
      2,
      "multiple draft leaves should all be counted",
    );
  });

  it("does not count task group itself as draft even if refinement=draft", () => {
    // Task groups are structural — only leaves count toward draft total.
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "draft",
      children: [concLeaf(nid(), "a", "exit 0", "desc")],
      last_status: "draft",
    };
    assert.equal(countDraftNodes([group]), 0, "task group with concrete children should count as zero drafts");
  });

  it("counts draft children inside task group", () => {
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "draft",
      children: [
        concLeaf(nid(), "a", "exit 0", "desc"),
        draftLeaf(nid(), "b", "intent b"),
        draftLeaf(nid(), "c", "intent c"),
      ],
      last_status: "draft",
    };
    assert.equal(countDraftNodes([group]), 2, "should count only draft children, not the group itself");
  });
});

// ── Fingerprint ───────────────────────────────────────────────────────

describe("computeProofFingerprint", () => {
  const { nid } = scope();

  it("empty for all-draft tree", () => {
    assert.equal(
      computeProofFingerprint([draftLeaf(nid(), "a", "i")]),
      "",
      "all-draft tree should produce empty fingerprint",
    );
  });

  it("hashes concrete leaves", () => {
    const fp = computeProofFingerprint([concLeaf(nid(), "a", "echo x", "t")]);
    assert.equal(fp.length, 64, "fingerprint should be a 64-char hex string (full sha256)");
  });

  it("changes when command changes", () => {
    const r: TaskNode[] = [concLeaf(nid(), "a", "cmd1", "t")];
    const fp1 = computeProofFingerprint(r);
    r[0].command = "cmd2";
    assert.notEqual(fp1, computeProofFingerprint(r), "changing the command should change the fingerprint");
  });

  it("includes advisory in hash", () => {
    const fp1 = computeProofFingerprint([concLeaf(nid(), "a", "e", "t")]);
    const fp2 = computeProofFingerprint([concLeaf(nid(), "a", "e", "t", undefined, { advisory: true })]);
    assert.notEqual(fp1, fp2, "advisory flag should be included in the hash");
  });
});

// ── checkDocument: drafts ─────────────────────────────────────────────

describe("checkDocument drafts", () => {
  const { nid } = scope();

  it("incomplete when drafts present", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok"), draftLeaf(nid(), "b", "pending")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "incomplete", "draft present should yield incomplete");
    assert.equal(res.draft_count, 1, "draft count should be 1");
  });

  it("reports draft leaves as status draft", async () => {
    const doc = makeDoc([draftLeaf(nid(), "a", "intent")]);
    const res = await checkDocument(doc);
    const d = res.leaves.find((l) => l.status === "draft");
    assert.ok(d, "there should be a draft leaf result");
    assert.ok(d?.output?.includes("DRAFT"), "draft output should mention DRAFT");
  });

  it("pass when all concrete and no drafts", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { allow_dirty_pass: true });
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "all concrete should pass");
  });

  it("task group itself not counted as draft even when refinement=draft", async () => {
    // Regression: buildTaskNodes used to set refinement=draft on groups.
    // The structural check (has children) must take precedence over refinement.
    const group: TaskNode = {
      id: nid(),
      title: "g",
      refinement: "draft",
      children: [concLeaf(nid(), "a", "exit 0", "ok"), concLeaf(nid(), "b", "exit 0", "ok too")],
      last_status: "draft",
    };
    const doc = makeDoc([group], { allow_dirty_pass: true });
    const res = await checkDocument(doc);
    assert.equal(res.draft_count, 0, "task group with concrete children should have zero drafts");
    assert.equal(res.overall, "pass", "should pass with no drafts and all concrete");
  });
});

// ── checkDocument: execution ──────────────────────────────────────────

describe("checkDocument execution", () => {
  const { nid } = scope();

  it("exit_code 0 passes", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "ok")]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass", "exit 0 should pass with exit_code predicate");
  });

  it("exit_code mismatch fails", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 1", "fail", { type: "exit_code", value: 0 })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail", "exit 1 with expected 0 should fail");
  });

  it("output_contains matches", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hello", "t", { type: "output_contains", value: "hello" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass", "output containing expected string should pass");
  });

  it("output_contains mismatch fails", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hi", "t", { type: "output_contains", value: "world" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail", "output lacking expected string should fail");
  });
});

// ── checkDocument: manual ─────────────────────────────────────────────

describe("checkDocument manual", () => {
  const { nid } = scope();

  it("skipped when unverified", async () => {
    const doc = makeDoc([manualLeaf(nid(), "m", "check")]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "skipped", "unverified manual proof should be skipped");
  });

  it("pass when verified with matching fingerprint", async () => {
    const n = manualLeaf(nid(), "m", "check");
    n.manual_result = {
      answer: "pass",
      confirmed_at: new Date().toISOString(),
      channel: "elicitation",
      proof_fingerprint: perProofFingerprint(n),
    };
    assert.equal(
      (await checkDocument(makeDoc([n]))).leaves[0].status,
      "pass",
      "verified manual proof with matching fingerprint should pass",
    );
  });
});

// ── parseSurvivors ────────────────────────────────────────────────────

describe("parseSurvivors", () => {
  it("cargo-mutants", () => {
    assert.equal(parseSurvivors("152 missed"), 152, "cargo-mutants '152 missed' should parse to 152");
    assert.equal(parseSurvivors("0 missed"), 0, "cargo-mutants '0 missed' should parse to 0");
  });
  it("mutmut", () => {
    assert.equal(parseSurvivors("Survived 🙁 (5)"), 5, "mutmut format should parse to 5");
  });
  it("unrecognized", () => {
    assert.equal(parseSurvivors("garbage"), null, "unrecognized output should return null");
  });
});

// ── checkDocument: TDD ────────────────────────────────────────────────

describe("checkDocument TDD", () => {
  const { nid } = scope();

  it("fails without prior red", async () => {
    const doc = makeDoc([concLeaf(nid(), "t", "exit 0", "tdd", { type: "tdd", value: 0 })]);
    const r = await checkDocument(doc);
    assert.equal(r.leaves[0].status, "fail", "TDD should fail when no prior red was recorded");
    assert.ok(r.leaves[0].error?.includes("TDD: GREEN w/o prior RED"), "error should mention TDD violation");
  });

  it("records seen_failing on red", async () => {
    const n = concLeaf(nid(), "t", "exit 1", "tdd", { type: "tdd", value: 0 });
    await checkDocument(makeDoc([n]));
    assert.equal(n.seen_failing, true, "seen_failing should be set after a red (failing) run");
  });

  it("passes after red→green", async () => {
    const n = concLeaf(nid(), "t", "exit 0", "tdd", { type: "tdd", value: 0 });
    n.seen_failing = true;
    n.seen_failing_at = new Date().toISOString();
    assert.equal((await checkDocument(makeDoc([n]))).leaves[0].status, "pass", "TDD should pass after red→green cycle");
  });
});

// ── Scoped run ────────────────────────────────────────────────────────

describe("checkDocument scoped", () => {
  const { nid } = scope();

  it("incomplete for subtree scope", async () => {
    const g = groupNode(nid(), "g", [concLeaf(nid(), "a", "exit 0", "ok")]);
    const r = await checkDocument(makeDoc([g]), undefined, { nodePath: "0.children.0" });
    assert.equal(r.overall, "incomplete", "scoped run should always be incomplete");
    assert.equal(r.scoped, true, "scoped flag should be set");
  });
});

// ── Advisory ──────────────────────────────────────────────────────────

describe("checkDocument advisory", () => {
  const { nid } = scope();

  it("advisory fail does not block", async () => {
    const doc = makeDoc(
      [
        concLeaf(nid(), "a", "exit 0", "ok"),
        concLeaf(nid(), "adv", "exit 1", "warn", { type: "exit_code", value: 0 }, { advisory: true }),
      ],
      { allow_dirty_pass: true },
    );
    assert.equal((await checkDocument(doc)).overall, "pass", "advisory failure should not block overall pass");
  });

  it("hard fail blocks overall", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 1", "fail", { type: "exit_code", value: 0 })]);
    assert.equal((await checkDocument(doc)).overall, "fail", "hard failure should block overall");
  });
});

// ── checkDocument: all predicate types ────────────────────────────────

describe("checkDocument predicate types", () => {
  const { nid } = scope();

  it("exit_code_not with matching value fails", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "should fail", { type: "exit_code_not", value: 0 })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "fail",
      "exit_code_not should fail when exit code matches the forbidden value",
    );
  });

  it("exit_code_not with non-matching value passes", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "should pass", { type: "exit_code_not", value: 1 })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "pass",
      "exit_code_not should pass when exit code differs from the forbidden value",
    );
  });

  it("output_matches passes on regex match", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hello123", "t", { type: "output_matches", value: "hello\\d+" })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "pass",
      "output_matches should pass when output matches the regex",
    );
  });

  it("output_matches fails on regex mismatch", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo abc", "t", { type: "output_matches", value: "\\d+" })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "fail",
      "output_matches should fail when output does not match the regex",
    );
  });

  it("output_not_contains passes when substring absent", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hi", "t", { type: "output_not_contains", value: "bye" })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "pass",
      "output_not_contains should pass when output lacks the substring",
    );
  });

  it("output_not_contains fails when substring present", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo bye", "t", { type: "output_not_contains", value: "bye" })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "fail",
      "output_not_contains should fail when output contains the substring",
    );
  });

  it("output_not_matches passes on no regex match", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo abc", "t", { type: "output_not_matches", value: "\\d+" })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "pass",
      "output_not_matches should pass when output does not match the regex",
    );
  });

  it("output_not_matches fails on regex match", async () => {
    const doc = makeDoc([
      concLeaf(nid(), "x", "echo hello123", "t", { type: "output_not_matches", value: "hello\\d+" }),
    ]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "fail",
      "output_not_matches should fail when output matches the regex",
    );
  });

  it("review is skipped when unverified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "review", "review proof", { type: "review" })]);
    assert.equal(
      (await checkDocument(doc)).leaves[0].status,
      "skipped",
      "review proof should be skipped when unverified",
    );
  });

  it("mutation fails when output is not parseable", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "mutation", { type: "mutation", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "mutation should fail when output cannot be parsed");
    assert.ok(
      res.leaves[0].error?.includes("could not parse mutation results"),
      "error should explain that mutation output was unparseable",
    );
  });

  it("regression fails when no metric number found", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "regression", { type: "regression", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "regression should fail when no metric number is found in output");
    assert.ok(res.leaves[0].error?.includes("regression: no metric"), "error should mention the missing metric number");
  });

  it("assertions fails when no test files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "assertions", { type: "assertions", value: 1 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "assertions should fail when command does not reference test files");
    assert.ok(res.leaves[0].error?.includes("assertions: no test files"), "error should mention missing test files");
  });

  it("streamline passes with clean output", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "streamline", { type: "streamline", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "pass", "streamline should pass with no leftover references");
  });

  it("observability fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "observability", { type: "observability", value: 1 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "observability should fail when no source files are identified");
    assert.ok(
      res.leaves[0].error?.includes("observability: no source files"),
      "error should mention missing source files",
    );
  });

  it("brevity fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "brevity", { type: "brevity", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "brevity should fail when no source files are identified");
    assert.ok(res.leaves[0].error?.includes("brevity: no source files"), "error should mention missing source files");
  });

  it("line_length fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "line_length", { type: "line_length" })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "line_length should fail when no source files");
    assert.ok(res.leaves[0].error?.includes("line_length: no source files"));
  });

  it("function_size fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "function_size", { type: "function_size" })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "function_size should fail when no source files");
    assert.ok(res.leaves[0].error?.includes("function_size: no source files"));
  });

  it("file_size fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "file_size", { type: "file_size" })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "file_size should fail when no source files");
    assert.ok(res.leaves[0].error?.includes("file_size: no source files"));
  });

  it("cohesion fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "cohesion", { type: "cohesion" })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "cohesion should fail when no source files");
    assert.ok(res.leaves[0].error?.includes("cohesion: no source files"));
  });

  it("replacement_ratio fails when no diff data in output", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hello", "replacement_ratio", { type: "replacement_ratio" })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "replacement_ratio should fail when no diff data");
    assert.ok(res.leaves[0].error?.includes("replacement_ratio: no diff data"));
  });

  // ── success paths ─────────────────────────────────────────────────

  it("regression captures baseline on first run (baseline_captured)", async () => {
    const doc = makeDoc([concLeaf(nid(), "r", "echo 42", "regression 42", { type: "regression", value: 0 })]);
    const res = await checkDocument(doc, undefined, { execFn: fakeExec("42") });
    assert.equal(res.leaves[0].status, "baseline_captured", "first regression run captures baseline");
  });

  it("regression with baseline_captured yields INCOMPLETE overall", async () => {
    const doc = makeDoc([concLeaf(nid(), "r", "echo 42", "regression 42", { type: "regression", value: 0 })]);
    const res = await checkDocument(doc, undefined, { execFn: fakeExec("42") });
    assert.equal(res.overall, "incomplete", "dod_check with only baseline_captured leaf should be INCOMPLETE");
  });

  it("regression second run passes when metric within tolerance", async () => {
    const doc = makeDoc([concLeaf(nid(), "r", "echo 42", "regression 42", { type: "regression", value: 0 })], {
      allow_dirty_pass: true,
    });
    // Pre-set baseline to simulate second run
    doc.roots[0].baseline_value = 42;
    doc.roots[0].baseline_captured_at = "2024-01-01T00:00:00Z";
    const res = await checkDocument(doc, undefined, { execFn: fakeExec("42") });
    assert.equal(res.leaves[0].status, "pass", "second run should PASS when equal to baseline");
    assert.equal(res.overall, "pass", "full dod_check with passing regression should PASS");
  });

  it("mutation passes when survivors ≤ allowed value", async () => {
    const doc = makeDoc([concLeaf(nid(), "m", "cargo mutants", "mutation", { type: "mutation", value: 0 })]);
    // cargo-mutants format: "N missed"
    const out = "0 missed mutants. All good.";
    const res = await checkDocument(doc, undefined, { execFn: fakeExec(out) });
    assert.equal(res.leaves[0].status, "pass", "mutation should pass with 0 survivors when max=0");
  });

  it("mutation fails when survivors > allowed value", async () => {
    const doc = makeDoc([concLeaf(nid(), "m2", "cargo mutants", "mutation", { type: "mutation", value: 0 })]);
    const out = "2 missed mutants.";
    const res = await checkDocument(doc, undefined, { execFn: fakeExec(out) });
    assert.equal(res.leaves[0].status, "fail", "2 survivors > 0 allowed → fail");
  });
});

// ── checkDocument: tamper detection ────────────────────────────────────

describe("checkDocument tamper detection", () => {
  const { nid } = scope();

  it("detects fingerprint mismatch -> forced fail", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { proof_fingerprint: "tampered" });
    const res = await checkDocument(doc);
    assert.equal(res.overall, "fail", "tampered document should have overall 'fail'");
    assert.equal(res.tampered, true, "tampered flag should be true");
  });

  it("passes when fingerprint matches", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { allow_dirty_pass: true });
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "non-tampered document should pass");
    assert.equal(res.tampered, undefined, "tampered flag should be absent");
  });

  it("passes tamper check when no fingerprint stored", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { allow_dirty_pass: true });
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "no stored fingerprint should not be flagged as tampered");
    assert.equal(res.tampered, undefined, "tampered flag should be absent");
  });

  // ── Strength-bearing field tamper tests ────────────────────────────

  it("detects tamper when max_function_lines mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "max func lines", {
      type: "exit_code",
      value: 0,
      max_function_lines: 30,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).max_function_lines = 99;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to max_function_lines should flag tamper");
  });

  it("detects tamper when max_file_lines mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "max file lines", {
      type: "exit_code",
      value: 0,
      max_file_lines: 300,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).max_file_lines = 500;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to max_file_lines should flag tamper");
  });

  it("detects tamper when max_line_length mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "max line length", {
      type: "exit_code",
      value: 0,
      max_line_length: 120,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).max_line_length = 200;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to max_line_length should flag tamper");
  });

  it("detects tamper when max_complexity mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "max complexity", {
      type: "exit_code",
      value: 0,
      max_complexity: 5,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).max_complexity = 20;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to max_complexity should flag tamper");
  });

  it("detects tamper when extract mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "extract test", {
      type: "regression",
      value: 0,
      extract: "(\\d+)",
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).extract = "(\\w+)";
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to extract should flag tamper");
  });

  it("detects tamper when baseline_value mutated", async () => {
    const n = concLeaf(
      nid(),
      "a",
      "exit 0",
      "baseline test",
      {
        type: "regression",
        value: 0,
      },
      { baseline_value: 42 },
    );
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    n.baseline_value = 99;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to baseline_value should flag tamper");
  });

  it("detects tamper when timeout_ms mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "timeout test", {
      type: "exit_code",
      value: 0,
      timeout_ms: 60000,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).timeout_ms = 120000;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to timeout_ms should flag tamper");
  });

  it("detects tamper when category mutated", async () => {
    const n = concLeaf(
      nid(),
      "a",
      "exit 0",
      "category test",
      {
        type: "exit_code",
        value: 0,
      },
      { category: "test" },
    );
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    n.category = "lint";
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to category should flag tamper");
  });

  it("detects tamper when min_replacement_ratio mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "replacement ratio", {
      type: "replacement_ratio",
      min_replacement_ratio: 0.2,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).min_replacement_ratio = 0.5;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to min_replacement_ratio should flag tamper");
  });

  it("detects tamper when lower_is_better mutated", async () => {
    const n = concLeaf(nid(), "a", "exit 0", "lower is better", {
      type: "regression",
      value: 0,
      lower_is_better: true,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    (n.predicate as Predicate).lower_is_better = false;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to lower_is_better should flag tamper");
  });

  it("detects tamper when advisory flag toggled", async () => {
    const n = concLeaf(
      nid(),
      "a",
      "exit 0",
      "advisory test",
      {
        type: "exit_code",
        value: 0,
      },
      { advisory: true },
    );
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    n.advisory = false;
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "toggle of advisory should flag tamper");
  });

  it("detects tamper when command mutated", async () => {
    const n = concLeaf(nid(), "a", "echo original", "cmd test", {
      type: "exit_code",
      value: 0,
    });
    const doc = makeDoc([n]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    n.command = "echo tampered";
    const res = await checkDocument(doc);
    assert.equal(res.tampered, true, "change to command should flag tamper");
  });
});

// ── isExecutablePredicate ──────────────────────────────────────────────

describe("isExecutablePredicate", () => {
  it("returns true for machine-checkable types", () => {
    assert.equal(isExecutablePredicate("exit_code"), true, "exit_code should be executable");
    assert.equal(isExecutablePredicate("tdd"), true, "tdd should be executable");
    assert.equal(isExecutablePredicate("mutation"), true, "mutation should be executable");
    assert.equal(isExecutablePredicate("regression"), true, "regression should be executable");
    assert.equal(isExecutablePredicate("assertions"), true, "assertions should be executable");
    assert.equal(isExecutablePredicate("streamline"), true, "streamline should be executable");
    assert.equal(isExecutablePredicate("observability"), true, "observability should be executable");
    assert.equal(isExecutablePredicate("brevity"), true, "brevity should be executable");
    assert.equal(isExecutablePredicate("line_length"), true, "line_length should be executable");
    assert.equal(isExecutablePredicate("function_size"), true, "function_size should be executable");
    assert.equal(isExecutablePredicate("file_size"), true, "file_size should be executable");
    assert.equal(isExecutablePredicate("cohesion"), true, "cohesion should be executable");
    assert.equal(isExecutablePredicate("replacement_ratio"), true, "replacement_ratio should be executable");
  });

  it("returns false for out-of-band types", () => {
    assert.equal(isExecutablePredicate("manual"), false, "manual should not be executable");
    assert.equal(isExecutablePredicate("review"), false, "review should not be executable");
  });
});

// ── extractExecutableCommands ──────────────────────────────────────────

describe("extractExecutableCommands", () => {
  const { nid } = scope();

  it("collects commands from machine-checkable concrete leaves", () => {
    const cmds = extractExecutableCommands([
      concLeaf(nid(), "a", "exit 0", "test"),
      concLeaf(nid(), "b", "npm test", "test"),
    ]);
    assert.deepEqual(cmds, ["exit 0", "npm test"], "should collect commands from all concrete leaves");
  });

  it("excludes manual proofs", () => {
    const cmds = extractExecutableCommands([
      manualLeaf(nid(), "m", "check manually"),
      concLeaf(nid(), "a", "exit 0", "test"),
    ]);
    assert.deepEqual(cmds, ["exit 0"], "should exclude manual proof commands");
  });

  it("excludes review proofs", () => {
    const node = concLeaf(nid(), "r", "review instructions here", "review", { type: "review" });
    const cmds = extractExecutableCommands([node]);
    assert.deepEqual(cmds, [], "review proof commands should be excluded from OS validation");
  });

  it("excludes both manual and review types", () => {
    const cmds = extractExecutableCommands([
      manualLeaf(nid(), "m", "manual check"),
      concLeaf(nid(), "r", "review cmd", "review", { type: "review" }),
      concLeaf(nid(), "a", "exit 0", "auto"),
    ]);
    assert.deepEqual(cmds, ["exit 0"], "only the machine-checkable proof command should remain");
  });

  it("skips draft nodes", () => {
    const cmds = extractExecutableCommands([draftLeaf(nid(), "d", "intent"), concLeaf(nid(), "a", "exit 0", "auto")]);
    assert.deepEqual(cmds, ["exit 0"], "should exclude draft node commands");
  });
});

// ── checkDocument: derived signals ──────────────────────────────────────

describe("checkDocument derived signals", () => {
  const { nid } = scope();

  it("blocked_by_manuals: true when all automated pass but manuals unverified", async () => {
    const doc = makeDoc([concLeaf(nid(), "auto", "exit 0", "passing test"), manualLeaf(nid(), "m", "needs human")]);
    const res = await checkDocument(doc);
    assert.equal(
      res.blocked_by_manuals,
      true,
      "should report blocked_by_manuals when automated pass + manual unverified",
    );
    assert.equal(res.manual_unverified, 1, "should have 1 unverified manual leaf");
    assert.equal(res.draft_count, 0, "should have no draft nodes");
  });

  it("blocked_by_manuals: false when a hard failure exists alongside unverified manuals", async () => {
    const doc = makeDoc([
      concLeaf(nid(), "fail", "exit 1", "broken", { type: "exit_code", value: 0 }),
      manualLeaf(nid(), "m", "needs human"),
    ]);
    const res = await checkDocument(doc);
    assert.equal(res.blocked_by_manuals, false, "blocked_by_manuals only true when ALL automated proofs pass");
  });

  it("blocked_by_manuals: false when all concrete pass and no manuals", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.blocked_by_manuals, false, "should be false when no manual proofs exist");
  });

  it("amendment_warnings: empty when no amendments in document", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.deepEqual(res.amendment_warnings, [], "should have no amendment warnings");
  });

  it("amendment_warnings: warns on excessive amendments (> 2)", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    doc.amendments = [
      { timestamp: "T1", node_path: "0", action: "modified", reason: "R1", old_value: {}, new_value: {} },
      { timestamp: "T2", node_path: "0", action: "modified", reason: "R2", old_value: {}, new_value: {} },
      { timestamp: "T3", node_path: "0", action: "modified", reason: "R3", old_value: {}, new_value: {} },
    ];
    const res = await checkDocument(doc);
    assert.equal(res.amendment_warnings.length, 1, "should have 1 amendment warning for node at path 0");
    assert.equal(res.amendment_warnings[0].count, 3, "should show amendment count > 2");
    assert.equal(res.amendment_warnings[0].node_path, "0", "should reference the amended node path");
  });

  it("scoped-check suggestion: does not fire for <= 5 concrete leaves", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")], { allow_dirty_pass: true });
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "single leaf should pass");
    // No scoped flag — not a scoped run
    assert.ok(
      !("ran_node_path" in res) || res.ran_node_path === undefined,
      "should not suggest scoped check for <= 5 leaves",
    );
  });
});

// ── checkDocument: brevity-family predicates (temp-dir backed) ─────────

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("checkDocument brevity-family predicates", () => {
  const { nid } = scope();
  let tmpDir: string;

  function writeSource(relPath: string, content: string): string {
    const full = path.join(tmpDir, relPath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
    return full;
  }

  before(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "dod-brevity-"));
  });

  after(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it("line_length passes when all lines within limit", async () => {
    writeSource("src/clean.ts", "export const x = 1;\nexport const y = 2;\n");
    const cmd = `node ${path.join(tmpDir, "src", "clean.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "ll", cmd, "check line length", { type: "line_length" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "pass",
      `clean file should pass line_length, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
  });

  it("line_length fails when lines exceed limit", async () => {
    const longLine = "x".repeat(150);
    writeSource("src/long.ts", `export const s = "${longLine}";\n`);
    const cmd = `node ${path.join(tmpDir, "src", "long.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "ll", cmd, "check line length", { type: "line_length" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "fail",
      `150-char line should fail line_length (max 120), got: ${res.leaves[0].status}`,
    );
    assert.ok(
      res.leaves[0].error?.includes("line_length FAIL"),
      `error should mention line_length FAIL, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
  });

  it("function_size passes when all functions within limit", async () => {
    writeSource("src/short.ts", "export function add(a: number, b: number): number {\n  return a + b;\n}\n");
    const cmd = `node ${path.join(tmpDir, "src", "short.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "fs", cmd, "check function size", { type: "function_size" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "pass",
      `short function should pass function_size, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
  });

  it("function_size fails when function exceeds limit", async () => {
    const lines = ["export function big(): void {"];
    for (let i = 0; i < 35; i++) lines.push(`  console.log(${i});`);
    lines.push("}");
    writeSource("src/big.ts", lines.join("\n"));
    const cmd = `node ${path.join(tmpDir, "src", "big.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "fs", cmd, "check function size", { type: "function_size" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "fail",
      `35+ line function should fail function_size (max 30), got: ${res.leaves[0].status}`,
    );
    assert.ok(res.leaves[0].error?.includes("function_size FAIL"));
  });

  it("file_size passes when file within limit", async () => {
    writeSource("src/small.ts", "export const x = 1;\n");
    const cmd = `node ${path.join(tmpDir, "src", "small.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "fsz", cmd, "check file size", { type: "file_size" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "pass",
      `small file should pass file_size, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
  });

  it("file_size fails when file exceeds limit", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 350; i++) lines.push(`// line ${i}`);
    writeSource("src/huge.ts", lines.join("\n"));
    const cmd = `node ${path.join(tmpDir, "src", "huge.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "fsz", cmd, "check file size", { type: "file_size" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "fail",
      `350-line file should fail file_size (max 300), got: ${res.leaves[0].status}`,
    );
    assert.ok(res.leaves[0].error?.includes("file_size FAIL"));
  });

  it("cohesion passes when CC ≤ 5 and clean guard clauses", async () => {
    writeSource("src/clean.ts", "export function add(a: number, b: number): number {\n  return a + b;\n}\n");
    const cmd = `node ${path.join(tmpDir, "src", "clean.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "co", cmd, "check cohesion", { type: "cohesion" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "pass",
      `low-CC clean function should pass cohesion, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
  });

  it("cohesion fails when CC exceeds max", async () => {
    writeSource(
      "src/complex.ts",
      [
        "export function classify(x: number, y: number, z: number): string {",
        "  if (x > 0) {",
        "    if (y > 0) {",
        "      if (z > 0 && x > y) return 'A';",
        "      else if (z < 0) return 'B';",
        "      return 'C';",
        "    }",
        "    for (let i = 0; i < x; i++) {",
        "      if (i > 10) break;",
        "    }",
        "  }",
        "  switch (z) {",
        "    case 1: return 'D';",
        "    case 2: return 'E';",
        "  }",
        "  return 'F';",
        "}",
      ].join("\n"),
    );
    const cmd = `node ${path.join(tmpDir, "src", "complex.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "co", cmd, "check cohesion", { type: "cohesion" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(res.leaves[0].status, "fail", `high-CC function should fail cohesion, got: ${res.leaves[0].status}`);
    assert.ok(res.leaves[0].error?.includes("cohesion FAIL"));
  });

  it("cohesion fails on unnecessary else after return", async () => {
    writeSource(
      "src/unnec.ts",
      [
        "export function validate(n: number): string {",
        "  if (n > 0) {",
        "    return 'ok';",
        "  } else {",
        "    return 'bad';",
        "  }",
        "}",
      ].join("\n"),
    );
    const cmd = `node ${path.join(tmpDir, "src", "unnec.ts")}`;
    const doc = makeDoc([concLeaf(nid(), "co", cmd, "check cohesion", { type: "cohesion" })]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(res.leaves[0].status, "fail", `unnecessary else should fail cohesion, got: ${res.leaves[0].status}`);
  });

  it("cohesion can disable guard clause check", async () => {
    writeSource(
      "src/unnec2.ts",
      [
        "export function validate(n: number): string {",
        "  if (n > 0) {",
        "    return 'ok';",
        "  } else {",
        "    return 'bad';",
        "  }",
        "}",
      ].join("\n"),
    );
    const cmd = `node ${path.join(tmpDir, "src", "unnec2.ts")}`;
    const doc = makeDoc([
      concLeaf(nid(), "co", cmd, "check cohesion", {
        type: "cohesion",
        require_guard_clauses: false,
        suggest_guard_clauses: false,
      }),
    ]);
    const res = await checkDocument(doc, tmpDir);
    assert.equal(
      res.leaves[0].status,
      "pass",
      `cohesion with guard checks off should pass, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
  });

  it("replacement_ratio passes when ratio is healthy", async () => {
    writeSource("src/healthy.ts", "export const x = 1;\n");
    // 10 insertions, 5 deletions → ratio 0.5 > min 0.2
    // Use fakeExec to supply numstat output with real tabs (echo on cmd.exe doesn't interpret \t)
    const tab = "\t";
    const doc = makeDoc([
      concLeaf(nid(), "rr", "unused", "check ratio", { type: "replacement_ratio", min_replacement_ratio: 0.2 }),
    ]);
    const res = await checkDocument(doc, tmpDir, {
      execFn: fakeExec(`10${tab}5${tab}src/healthy.ts`),
    });
    assert.equal(res.leaves[0].status, "pass", `healthy ratio should pass, got: ${res.leaves[0].error?.slice(0, 120)}`);
  });

  it("replacement_ratio fails when deletion ratio too low", async () => {
    writeSource("src/accrete.ts", "export const x = 1;\nexport const y = 2;\n");
    // 15 insertions, 0 deletions → ratio 0 < min 0.2
    const tab = "\t";
    const doc = makeDoc([
      concLeaf(nid(), "rr", "unused", "check ratio", { type: "replacement_ratio", min_replacement_ratio: 0.2 }),
    ]);
    const res = await checkDocument(doc, tmpDir, {
      execFn: fakeExec(`15${tab}0${tab}src/accrete.ts`),
    });
    assert.equal(
      res.leaves[0].status,
      "fail",
      `0% deletion ratio should fail, got: ${res.leaves[0].error?.slice(0, 120)}`,
    );
    assert.ok(res.leaves[0].error?.includes("replacement_ratio FAIL"));
  });
});

// ── findNodeById & formatTree ───────────────────────────────────────

describe("findNodeById", () => {
  function makeRoots(): TaskNode[] {
    return [
      {
        id: "node-root-0",
        title: "Root Group",
        refinement: "concrete",
        last_status: "pending",
        children: [
          {
            id: "node-child-0",
            title: "First Child",
            refinement: "concrete",
            last_status: "pass",
            command: "echo ok",
            predicate: { type: "exit_code", value: 0 },
            description: "proof 1",
          },
          {
            id: "node-child-1",
            title: "Second Child",
            refinement: "draft",
            intent: "will prove something",
            last_status: "draft",
          },
        ],
      },
      {
        id: "node-root-1",
        title: "Standalone Proof",
        refinement: "concrete",
        last_status: "fail",
        command: "exit 1",
        predicate: { type: "exit_code", value: 0 },
        description: "standalone",
      },
    ];
  }

  it("finds root-level node by ID with correct path", () => {
    const roots = makeRoots();
    const found = findNodeById(roots, "node-root-1");
    assert.ok(found);
    assert.equal(found.node.id, "node-root-1");
    assert.equal(found.node.title, "Standalone Proof");
    assert.equal(found.path, "1");
  });

  it("finds nested child node by ID with correct path", () => {
    const roots = makeRoots();
    const found = findNodeById(roots, "node-child-0");
    assert.ok(found);
    assert.equal(found.node.id, "node-child-0");
    assert.equal(found.node.title, "First Child");
    assert.equal(found.path, "0.children.0");
  });

  it("finds draft node by ID", () => {
    const roots = makeRoots();
    const found = findNodeById(roots, "node-child-1");
    assert.ok(found);
    assert.equal(found.node.refinement, "draft");
    assert.equal(found.path, "0.children.1");
  });

  it("returns null for non-existent ID", () => {
    const roots = makeRoots();
    assert.equal(findNodeById(roots, "nonexistent"), null);
  });

  it("path reflects tree state after removal (indices shift)", () => {
    const roots = makeRoots();
    // Remove first child — second child shifts from index 1 to index 0
    const group = roots[0];
    if (group.children) group.children.splice(0, 1);
    const found = findNodeById(roots, "node-child-1");
    assert.ok(found);
    assert.equal(found.path, "0.children.0", "path should reflect shifted index after removal");
  });

  it("path reflects tree state after add (appended at end)", () => {
    const roots = makeRoots();
    const group = roots[0];
    if (group.children)
      group.children.push({
        id: "node-new",
        title: "New Node",
        refinement: "concrete",
        last_status: "pending",
        command: "echo new",
        predicate: { type: "exit_code", value: 0 },
        description: "added later",
      });
    const found = findNodeById(roots, "node-new");
    assert.ok(found);
    assert.equal(found.path, "0.children.2", "path should be last index");
  });
});

describe("formatTree", () => {
  function makeRoots(): TaskNode[] {
    return [
      {
        id: "g1",
        title: "Core Features",
        refinement: "concrete",
        last_status: "pending",
        children: [
          {
            id: "p1",
            title: "Build passes",
            refinement: "concrete",
            last_status: "pass",
            command: "npm run build",
            predicate: { type: "exit_code", value: 0 },
            description: "build check",
          },
          {
            id: "d1",
            title: "Test coverage",
            refinement: "draft",
            intent: "ensure 80% coverage",
            last_status: "draft",
          },
        ],
      },
      {
        id: "p2",
        title: "Lint check",
        refinement: "concrete",
        last_status: "fail",
        command: "npm run lint",
        predicate: { type: "exit_code", value: 0 },
        description: "lint",
      },
    ];
  }

  it("shows correct node counts in header", () => {
    const roots = makeRoots();
    const tree = formatTree(roots, { title: "Test DoD", id: "test-1" });
    assert.ok(tree.includes("Test DoD (test-1)"));
    assert.ok(tree.includes("4 nodes:"));
    assert.ok(tree.includes("2 concrete"));
    assert.ok(tree.includes("1 draft"));
  });

  it("renders all node types with paths and IDs", () => {
    const roots = makeRoots();
    const tree = formatTree(roots);
    // Group
    assert.ok(tree.includes('0 [g1] GROUP: "Core Features"'));
    // Concrete proof
    assert.ok(tree.includes('0.children.0 [p1] PROOF: "Build passes" (pass)'));
    // Draft
    assert.ok(tree.includes('0.children.1 [d1] DRAFT: "Test coverage"'));
    // Root-level concrete
    assert.ok(tree.includes('1 [p2] PROOF: "Lint check" (fail)'));
  });

  it("scopes to subtree by node_id", () => {
    const roots = makeRoots();
    const tree = formatTree(roots, { scopeId: "g1" });
    // Should show children of g1 but NOT p2
    assert.ok(tree.includes("(scoped to Core Features [g1]"));
    assert.ok(tree.includes("[p1] PROOF"));
    assert.ok(tree.includes("[d1] DRAFT"));
    assert.ok(!tree.includes("[p2]"), "p2 should not appear in scoped view");
  });

  it("scopes to subtree by node_path", () => {
    const roots = makeRoots();
    const tree = formatTree(roots, { scopePath: "0" });
    assert.ok(tree.includes("(scoped to Core Features @ 0)"));
    assert.ok(tree.includes("[p1] PROOF"));
    assert.ok(!tree.includes("[p2]"), "p2 should not appear in scoped view");
  });

  it("returns error for bad scopeId", () => {
    const roots = makeRoots();
    assert.ok(formatTree(roots, { scopeId: "nope" }).startsWith("ERROR:"));
  });

  it("returns error for bad scopePath", () => {
    const roots = makeRoots();
    assert.ok(formatTree(roots, { scopePath: "99" }).startsWith("ERROR:"));
  });
});

describe("countAllNodes", () => {
  it("counts groups + leaves across tree", () => {
    const roots: TaskNode[] = [
      {
        id: "a",
        title: "A",
        refinement: "concrete",
        last_status: "pending",
        children: [
          {
            id: "b",
            title: "B",
            refinement: "concrete",
            last_status: "pass",
            command: "x",
            predicate: { type: "exit_code", value: 0 },
            description: "b",
          },
          { id: "c", title: "C", refinement: "draft", intent: "c", last_status: "draft" },
        ],
      },
    ];
    // 3 nodes: A (group) + B (concrete) + C (draft)
    assert.equal(countAllNodes(roots), 3);
  });

  it("counts flat roots", () => {
    const roots: TaskNode[] = [
      {
        id: "x",
        title: "X",
        refinement: "concrete",
        last_status: "pass",
        command: "x",
        predicate: { type: "exit_code", value: 0 },
        description: "x",
      },
      {
        id: "y",
        title: "Y",
        refinement: "concrete",
        last_status: "fail",
        command: "y",
        predicate: { type: "exit_code", value: 0 },
        description: "y",
      },
    ];
    assert.equal(countAllNodes(roots), 2);
  });
});

// ── detectStrengthReduction ────────────────────────────────────────────

describe("detectStrengthReduction", () => {
  it("returns empty when both predicates are undefined", () => {
    assert.deepEqual(detectStrengthReduction(undefined, undefined), []);
  });

  it("returns empty when new predicate is undefined", () => {
    const oldPred: Predicate = { type: "function_size", max_function_lines: 30 };
    assert.deepEqual(detectStrengthReduction(oldPred, undefined), []);
  });

  it("returns empty when old predicate is undefined", () => {
    const newPred: Predicate = { type: "function_size", max_function_lines: 40 };
    assert.deepEqual(detectStrengthReduction(undefined, newPred), []);
  });

  it("detects max_function_lines increase", () => {
    const oldPred: Predicate = { type: "function_size", max_function_lines: 30 };
    const newPred: Predicate = { type: "function_size", max_function_lines: 40 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /max_function_lines increased from 30 to 40/);
  });

  it("detects max_file_lines increase", () => {
    const oldPred: Predicate = { type: "file_size", max_file_lines: 200 };
    const newPred: Predicate = { type: "file_size", max_file_lines: 300 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /max_file_lines increased from 200 to 300/);
  });

  it("detects max_line_length increase", () => {
    const oldPred: Predicate = { type: "line_length", max_line_length: 100 };
    const newPred: Predicate = { type: "line_length", max_line_length: 120 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /max_line_length increased from 100 to 120/);
  });

  it("detects max_complexity increase", () => {
    const oldPred: Predicate = { type: "cohesion", max_complexity: 5 };
    const newPred: Predicate = { type: "cohesion", max_complexity: 10 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /max_complexity increased from 5 to 10/);
  });

  it("detects min_replacement_ratio decrease", () => {
    const oldPred: Predicate = { type: "replacement_ratio", min_replacement_ratio: 0.3 };
    const newPred: Predicate = { type: "replacement_ratio", min_replacement_ratio: 0.1 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /min_replacement_ratio decreased from 0.3 to 0.1/);
  });

  it("detects timeout_ms increase", () => {
    const oldPred: Predicate = { type: "exit_code", timeout_ms: 120_000 };
    const newPred: Predicate = { type: "exit_code", timeout_ms: 300_000 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /timeout_ms increased from 120000 to 300000/);
  });

  it("detects extract removal", () => {
    const oldPred: Predicate = { type: "regression", extract: "score: (\\d+)" };
    const newPred: Predicate = { type: "regression" };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /extract pattern removed/);
  });

  it("detects lower_is_better flip from false to true", () => {
    const oldPred: Predicate = { type: "regression", lower_is_better: false };
    const newPred: Predicate = { type: "regression", lower_is_better: true };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /lower_is_better changed from false to true/);
  });

  it("detects exit_code value changed from 0 to non-zero", () => {
    const oldPred: Predicate = { type: "exit_code", value: 0 };
    const newPred: Predicate = { type: "exit_code", value: 1 };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /exit_code value changed from 0 to 1/);
  });

  it("detects output_contains value shortened", () => {
    const oldPred: Predicate = { type: "output_contains", value: "long expected text" };
    const newPred: Predicate = { type: "output_contains", value: "short" };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /output_contains value shortened/);
  });

  it("detects output_matches value removed", () => {
    const oldPred: Predicate = { type: "output_matches", value: "pattern" };
    const newPred: Predicate = { type: "output_matches" };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 1);
    assert.match(result[0], /output_matches value removed/);
  });

  it("no false positive for non-strength-reducing changes", () => {
    const oldPred: Predicate = { type: "exit_code", value: 0 };
    const newPred: Predicate = { type: "exit_code", value: 0 };
    assert.deepEqual(detectStrengthReduction(oldPred, newPred), []);
  });

  it("no false positive when threshold is tightened", () => {
    const oldPred: Predicate = { type: "function_size", max_function_lines: 40 };
    const newPred: Predicate = { type: "function_size", max_function_lines: 30 };
    assert.deepEqual(detectStrengthReduction(oldPred, newPred), []);
  });

  it("no false positive for unchanged predicates", () => {
    const oldPred: Predicate = { type: "exit_code", value: 0, timeout_ms: 120_000 };
    const newPred: Predicate = { type: "exit_code", value: 0, timeout_ms: 120_000 };
    assert.deepEqual(detectStrengthReduction(oldPred, newPred), []);
  });

  it("detects multiple weakenings at once", () => {
    const oldPred: Predicate = {
      type: "brevity",
      max_function_lines: 30,
      max_file_lines: 200,
      max_complexity: 5,
    };
    const newPred: Predicate = {
      type: "brevity",
      max_function_lines: 50,
      max_file_lines: 400,
      max_complexity: 10,
    };
    const result = detectStrengthReduction(oldPred, newPred);
    assert.equal(result.length, 3);
  });
});

// ── countNodeAmendments ────────────────────────────────────────────────

describe("countNodeAmendments", () => {
  it("returns 0 when no amendments exist", () => {
    assert.equal(countNodeAmendments([], "0"), 0);
  });

  it("counts modified actions for matching path", () => {
    const amendments = [
      { timestamp: "T1", node_path: "0", action: "modified" as const, reason: "R1" },
      { timestamp: "T2", node_path: "0", action: "modified" as const, reason: "R2" },
      { timestamp: "T3", node_path: "0.children.1", action: "modified" as const, reason: "R3" },
    ];
    assert.equal(countNodeAmendments(amendments, "0"), 2);
  });

  it("excludes added and removed actions", () => {
    const amendments = [
      { timestamp: "T1", node_path: "0", action: "added" as const, reason: "R1" },
      { timestamp: "T2", node_path: "0", action: "modified" as const, reason: "R2" },
      { timestamp: "T3", node_path: "0", action: "removed" as const, reason: "R3" },
    ];
    assert.equal(countNodeAmendments(amendments, "0"), 1);
  });

  it("counts refined actions too", () => {
    const amendments = [
      { timestamp: "T1", node_path: "0", action: "refined" as const, reason: "R1" },
      { timestamp: "T2", node_path: "0", action: "modified" as const, reason: "R2" },
    ];
    assert.equal(countNodeAmendments(amendments, "0"), 2);
  });

  it("returns 0 for path with no matching amendments", () => {
    const amendments = [{ timestamp: "T1", node_path: "0.children.1", action: "modified" as const, reason: "R1" }];
    assert.equal(countNodeAmendments(amendments, "0"), 0);
  });
});

// ── checkAmendGate ─────────────────────────────────────────────────────

describe("checkAmendGate", () => {
  it("returns null (allowed) for 1st amend without justification", () => {
    const amendments = [{ timestamp: "T1", node_path: "0", action: "modified" as const, reason: "R1" }];
    const result = checkAmendGate(amendments, "0", undefined, undefined);
    assert.equal(result, null);
  });

  it("returns null (allowed) for 2nd amend without justification", () => {
    const amendments = [
      { timestamp: "T1", node_path: "0", action: "modified" as const, reason: "R1" },
      { timestamp: "T2", node_path: "0", action: "modified" as const, reason: "R2" },
    ];
    const result = checkAmendGate(amendments, "0", undefined, undefined);
    assert.equal(result, null);
  });

  it("blocks 4th amend without justification (count >= 3)", () => {
    const amendments = [
      { timestamp: "T1", node_path: "0", action: "modified" as const, reason: "R1" },
      { timestamp: "T2", node_path: "0", action: "modified" as const, reason: "R2" },
      { timestamp: "T3", node_path: "0", action: "modified" as const, reason: "R3" },
    ];
    const result = checkAmendGate(amendments, "0", undefined, undefined);
    assert.notEqual(result, null);
    assert.match(result as string, /amend_justification/);
  });

  it("allows 4th amend with justification", () => {
    const amendments = [
      { timestamp: "T1", node_path: "0", action: "modified" as const, reason: "R1" },
      { timestamp: "T2", node_path: "0", action: "modified" as const, reason: "R2" },
      { timestamp: "T3", node_path: "0", action: "modified" as const, reason: "R3" },
    ];
    const result = checkAmendGate(amendments, "0", undefined, undefined, "Needed because requirements changed");
    assert.equal(result, null);
  });

  it("blocks strength-reducing amend (max_function_lines increased) without justification", () => {
    const oldPred: Predicate = { type: "function_size", max_function_lines: 30 };
    const newPred: Predicate = { type: "function_size", max_function_lines: 40 };
    const result = checkAmendGate([], "0", oldPred, newPred);
    assert.notEqual(result, null);
    assert.match(result as string, /strength-reducing/i);
  });

  it("allows strength-reducing amend with justification", () => {
    const oldPred: Predicate = { type: "function_size", max_function_lines: 30 };
    const newPred: Predicate = { type: "function_size", max_function_lines: 40 };
    const result = checkAmendGate([], "0", oldPred, newPred, "Project guideline changed from 30 to 40 lines");
    assert.equal(result, null);
  });

  it("allows non-strength-reducing amend (command fix) without justification", () => {
    const oldPred: Predicate = { type: "exit_code", value: 0 };
    const newPred: Predicate = { type: "exit_code", value: 0 };
    const result = checkAmendGate([], "0", oldPred, newPred);
    assert.equal(result, null);
  });

  it("allows description-only amend without justification", () => {
    const result = checkAmendGate([], "0", undefined, undefined);
    assert.equal(result, null);
  });
});
