import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { checkDocument, parseSurvivors, computeProofFingerprint, flattenConcreteLeaves, hasDraftNodes, findNodeByPath, countDraftNodes, isExecutablePredicate, extractExecutableCommands } from "./checker.js";
import { perProofFingerprint } from "./manual.js";
import type { DodDocument, TaskNode } from "./types.js";

// ── Test helpers ─────────────────────────────────────────────────────

type Pred = TaskNode["predicate"];

/** Create per-describe-block scoped helpers for generating unique IDs. */
function scope() {
  let nodeId = 0;
  function nid(): string { return `n${++nodeId}`; }
  return { nid };
}

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
    const leaves = flattenConcreteLeaves([
      concLeaf(nid(), "a", "exit 0", "test"),
      draftLeaf(nid(), "b", "draft only"),
    ]);
    assert.equal(leaves.length, 1, "draft leaves should be skipped");
  });

  it("recurses into task groups", () => {
    const leaves = flattenConcreteLeaves([
      groupNode(nid(), "group", [
        concLeaf(nid(), "child", "exit 0", "test"),
      ]),
    ]);
    assert.equal(leaves.length, 1, "should recurse into group children");
    assert.ok(leaves[0].node_path.includes("children.0"), "path should include children segment");
  });

  it("returns empty for all-draft tree", () => {
    const leaves = flattenConcreteLeaves([
      draftLeaf(nid(), "a", "intent a"),
      draftLeaf(nid(), "b", "intent b"),
    ]);
    assert.equal(leaves.length, 0, "all-draft tree should produce no concrete leaves");
  });
});

describe("hasDraftNodes", () => {
  const { nid } = scope();

  it("detects draft leaves", () => {
    assert.equal(hasDraftNodes([draftLeaf(nid(), "a", "intent")]), true, "should detect a draft leaf");
  });

  it("detects nested drafts", () => {
    assert.equal(hasDraftNodes([
      groupNode(nid(), "g", [draftLeaf(nid(), "a", "intent")]),
    ]), true, "should detect drafts nested inside groups");
  });

  it("returns false for all-concrete", () => {
    assert.equal(hasDraftNodes([concLeaf(nid(), "a", "exit 0", "x")]), false, "all-concrete tree should have no drafts");
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
    assert.equal(countDraftNodes([
      concLeaf(nid(), "a", "exit 0", "x"),
      draftLeaf(nid(), "b", "intent"),
    ]), 1, "one draft in mixed tree should count as 1");
  });

  it("counts nested drafts in group", () => {
    assert.equal(countDraftNodes([
      groupNode(nid(), "g", [
        concLeaf(nid(), "a", "exit 0", "x"),
        draftLeaf(nid(), "b", "intent"),
      ]),
    ]), 1, "nested draft in group should be counted");
  });

  it("counts multiple drafts", () => {
    assert.equal(countDraftNodes([
      draftLeaf(nid(), "a", "intent a"),
      draftLeaf(nid(), "b", "intent b"),
    ]), 2, "multiple draft leaves should all be counted");
  });
});

// ── Fingerprint ───────────────────────────────────────────────────────

describe("computeProofFingerprint", () => {
  const { nid } = scope();

  it("empty for all-draft tree", () => {
    assert.equal(computeProofFingerprint([draftLeaf(nid(), "a", "i")]), "", "all-draft tree should produce empty fingerprint");
  });

  it("hashes concrete leaves", () => {
    const fp = computeProofFingerprint([concLeaf(nid(), "a", "echo x", "t")]);
    assert.equal(fp.length, 12, "fingerprint should be a 12-char hex string (sha256 slice)");
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
    const doc = makeDoc([
      concLeaf(nid(), "a", "exit 0", "ok"),
      draftLeaf(nid(), "b", "pending"),
    ]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "incomplete", "draft present should yield incomplete");
    assert.equal(res.draft_count, 1, "draft count should be 1");
  });

  it("reports draft leaves as status draft", async () => {
    const doc = makeDoc([draftLeaf(nid(), "a", "intent")]);
    const res = await checkDocument(doc);
    const d = res.leaves.find(l => l.status === "draft");
    assert.ok(d, "there should be a draft leaf result");
    assert.ok(d!.output?.includes("DRAFT"), "draft output should mention DRAFT");
  });

  it("pass when all concrete and no drafts", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "all concrete should pass");
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
    n.manual_result = { answer: "pass", confirmed_at: new Date().toISOString(), channel: "elicitation", proof_fingerprint: perProofFingerprint(n) };
    assert.equal((await checkDocument(makeDoc([n]))).leaves[0].status, "pass", "verified manual proof with matching fingerprint should pass");
  });
});

// ── parseSurvivors ────────────────────────────────────────────────────

describe("parseSurvivors", () => {
  it("cargo-mutants", () => {
    assert.equal(parseSurvivors("152 missed"), 152, "cargo-mutants '152 missed' should parse to 152");
    assert.equal(parseSurvivors("0 missed"), 0, "cargo-mutants '0 missed' should parse to 0");
  });
  it("mutmut", () => { assert.equal(parseSurvivors("Survived 🙁 (5)"), 5, "mutmut format should parse to 5"); });
  it("unrecognized", () => { assert.equal(parseSurvivors("garbage"), null, "unrecognized output should return null"); });
});

// ── checkDocument: TDD ────────────────────────────────────────────────

describe("checkDocument TDD", () => {
  const { nid } = scope();

  it("fails without prior red", async () => {
    const doc = makeDoc([concLeaf(nid(), "t", "exit 0", "tdd", { type: "tdd", value: 0 })]);
    const r = await checkDocument(doc);
    assert.equal(r.leaves[0].status, "fail", "TDD should fail when no prior red was recorded");
    assert.ok(r.leaves[0].error?.includes("TDD VIOLATION"), "error should mention TDD VIOLATION");
  });

  it("records seen_failing on red", async () => {
    const n = concLeaf(nid(), "t", "exit 1", "tdd", { type: "tdd", value: 0 });
    await checkDocument(makeDoc([n]));
    assert.equal(n.seen_failing, true, "seen_failing should be set after a red (failing) run");
  });

  it("passes after red→green", async () => {
    const n = concLeaf(nid(), "t", "exit 0", "tdd", { type: "tdd", value: 0 });
    n.seen_failing = true; n.seen_failing_at = new Date().toISOString();
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
    const doc = makeDoc([
      concLeaf(nid(), "a", "exit 0", "ok"),
      concLeaf(nid(), "adv", "exit 1", "warn", { type: "exit_code", value: 0 }, { advisory: true }),
    ]);
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
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail", "exit_code_not should fail when exit code matches the forbidden value");
  });

  it("exit_code_not with non-matching value passes", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "should pass", { type: "exit_code_not", value: 1 })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass", "exit_code_not should pass when exit code differs from the forbidden value");
  });

  it("output_matches passes on regex match", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hello123", "t", { type: "output_matches", value: "hello\\d+" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass", "output_matches should pass when output matches the regex");
  });

  it("output_matches fails on regex mismatch", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo abc", "t", { type: "output_matches", value: "\\d+" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail", "output_matches should fail when output does not match the regex");
  });

  it("output_not_contains passes when substring absent", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hi", "t", { type: "output_not_contains", value: "bye" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass", "output_not_contains should pass when output lacks the substring");
  });

  it("output_not_contains fails when substring present", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo bye", "t", { type: "output_not_contains", value: "bye" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail", "output_not_contains should fail when output contains the substring");
  });

  it("output_not_matches passes on no regex match", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo abc", "t", { type: "output_not_matches", value: "\\d+" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "pass", "output_not_matches should pass when output does not match the regex");
  });

  it("output_not_matches fails on regex match", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "echo hello123", "t", { type: "output_not_matches", value: "hello\\d+" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "fail", "output_not_matches should fail when output matches the regex");
  });

  it("review is skipped when unverified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "review", "review proof", { type: "review" })]);
    assert.equal((await checkDocument(doc)).leaves[0].status, "skipped", "review proof should be skipped when unverified");
  });

  it("mutation fails when output is not parseable", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "mutation", { type: "mutation", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "mutation should fail when output cannot be parsed");
    assert.ok(res.leaves[0].error?.includes("could not parse mutation results"), "error should explain that mutation output was unparseable");
  });

  it("regression fails when no metric number found", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "regression", { type: "regression", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "regression should fail when no metric number is found in output");
    assert.ok(res.leaves[0].error?.includes("could not parse a metric number"), "error should mention the missing metric number");
  });

  it("assertions fails when no test files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "assertions", { type: "assertions", value: 1 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "assertions should fail when command does not reference test files");
    assert.ok(res.leaves[0].error?.includes("could not identify any test files"), "error should mention missing test files");
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
    assert.ok(res.leaves[0].error?.includes("could not identify any source files"), "error should mention missing source files");
  });

  it("brevity fails when no source files identified", async () => {
    const doc = makeDoc([concLeaf(nid(), "x", "exit 0", "brevity", { type: "brevity", value: 0 })]);
    const res = await checkDocument(doc);
    assert.equal(res.leaves[0].status, "fail", "brevity should fail when no source files are identified");
    assert.ok(res.leaves[0].error?.includes("could not identify any source files"), "error should mention missing source files");
  });
});

// ── checkDocument: tamper detection ────────────────────────────────────

describe("checkDocument tamper detection", () => {
  const { nid } = scope();

  it("detects fingerprint mismatch -> forced fail", async () => {
    const doc = makeDoc(
      [concLeaf(nid(), "a", "exit 0", "ok")],
      { proof_fingerprint: "tampered" },
    );
    const res = await checkDocument(doc);
    assert.equal(res.overall, "fail", "tampered document should have overall 'fail'");
    assert.equal(res.tampered, true, "tampered flag should be true");
  });

  it("passes when fingerprint matches", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    doc.proof_fingerprint = computeProofFingerprint(doc.roots);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "non-tampered document should pass");
    assert.equal(res.tampered, undefined, "tampered flag should be absent");
  });

  it("passes tamper check when no fingerprint stored", async () => {
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "no stored fingerprint should not be flagged as tampered");
    assert.equal(res.tampered, undefined, "tampered flag should be absent");
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
    const cmds = extractExecutableCommands([
      draftLeaf(nid(), "d", "intent"),
      concLeaf(nid(), "a", "exit 0", "auto"),
    ]);
    assert.deepEqual(cmds, ["exit 0"], "should exclude draft node commands");
  });
});

// ── checkDocument: derived signals ──────────────────────────────────────

describe("checkDocument derived signals", () => {
  const { nid } = scope();

  it("blocked_by_manuals: true when all automated pass but manuals unverified", async () => {
    const doc = makeDoc([
      concLeaf(nid(), "auto", "exit 0", "passing test"),
      manualLeaf(nid(), "m", "needs human"),
    ]);
    const res = await checkDocument(doc);
    assert.equal(res.blocked_by_manuals, true, "should report blocked_by_manuals when automated pass + manual unverified");
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
    const doc = makeDoc([concLeaf(nid(), "a", "exit 0", "ok")]);
    const res = await checkDocument(doc);
    assert.equal(res.overall, "pass", "single leaf should pass");
    // No scoped flag — not a scoped run
    assert.ok(!("ran_node_path" in res) || res.ran_node_path === undefined, "should not suggest scoped check for <= 5 leaves");
  });
});
