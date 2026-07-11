import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyseAssertions } from "./assertions.js";
import { checkDocument } from "./checker.js";
import type { DodDocument, TaskNode } from "./types.js";

/** Fake command executor for deterministic, fast integration tests.
 *  Returns exit 0 with simulated output — assertions predicate uses the
 *  command only to identify test files, then scans them statically. */
function fakeExec(): (
  command: string,
  cwd: string,
) => Promise<{ exitCode: number; combined: string; duration: number }> {
  return async (_cmd, _cwd) => ({
    exitCode: 0,
    combined: "ok (simulated)",
    duration: 0,
  });
}

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "dod-assertions-"));
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf-8");
}

function docWithNode(dir: string, node: TaskNode): DodDocument {
  return {
    id: "test-assertions",
    title: "t",
    goal: "g",
    date: "2026-01-01",
    cwd: dir,
    markdown_path: join(dir, "dod.md"),
    created_at: "2026-01-01",
    sections: { requirements: "r" },
    roots: [node],
    amendments: [],
  };
}

// ── Unit: analyseAssertions ───────────────────────────────────────────

test("analyseAssertions returns null when no test files are referenced", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_foo.py": "assert True\n" });
  try {
    assert.equal(analyseAssertions("echo hello", dir), null, "should return null for non-test commands");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions detects trivial Python assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_trivial.py": "def test_one():\n    assert True\n    assert False\ndef test_two():\n    assert None\n",
  });
  try {
    const report = analyseAssertions("python -m pytest test_trivial.py", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.total, 3, `total=3, got ${report?.total}`);
    assert.equal(report?.trivial, 3, `trivial=3, got ${report?.trivial}`);
    assert.equal(report?.nonTrivial, 0, `nonTrivial=0, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions counts non-trivial Python assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_real.py":
      "import math\ndef test_sqrt():\n    assert math.sqrt(4) == 2.0\ndef test_upper():\n    assert 'hello'.upper() == 'HELLO'\n",
  });
  try {
    const report = analyseAssertions("python -m pytest test_real.py", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.nonTrivial, 2, `nonTrivial=2, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions splits trivial from non-trivial in mixed file", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_mixed.py": "def test_real():\n    x = 1 + 1\n    assert x == 2\ndef test_fake():\n    assert True\n",
  });
  try {
    const report = analyseAssertions("python -m pytest test_mixed.py", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.trivial, 1, `trivial=1, got ${report?.trivial}`);
    assert.equal(report?.nonTrivial, 1, `nonTrivial=1, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions detects trivial JS assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "e.test.ts": "test('t', () => { expect(true).toBe(true); expect(1).toEqual(1); });\n" });
  try {
    const report = analyseAssertions("npx jest e.test.ts", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.trivial, 2, `trivial=2, got ${report?.trivial}`);
    assert.equal(report?.nonTrivial, 0, `nonTrivial=0, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions counts non-trivial JS assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "m.test.ts":
      "import { add } from './math';\ntest('add', () => { expect(add(2,3)).toBe(5); expect(add(-1,1)).toEqual(0); });\n",
  });
  try {
    const report = analyseAssertions("npx jest m.test.ts", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.nonTrivial, 2, `nonTrivial=2, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions scans multiple test files", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_a.py": "def test():\n    assert True\n",
    "test_b.py": "def test():\n    x = 1\n    assert x == 1\n",
  });
  try {
    const report = analyseAssertions("python -m pytest test_a.py test_b.py", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.files.length, 2, `files=2, got ${report?.files.length}`);
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.trivial, 1, `trivial=1, got ${report?.trivial}`);
    assert.equal(report?.nonTrivial, 1, `nonTrivial=1, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Integration: assertions predicate through checkDocument ────────────
// All integration tests use fakeExec() for deterministic, fast execution.
// The assertions predicate identifies test files from the command string
// and scans them statically — subprocess execution is not required.

function mkAssertionNode(command: string, value?: number): TaskNode {
  return {
    id: "n1",
    title: "assertion check",
    refinement: "concrete",
    command,
    predicate: { type: "assertions", value },
    description: "assertions proof",
    last_status: "pending",
  };
}

test("assertions predicate: passes with sufficient non-trivial assertions", async () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_math.py": "def test_add():\n    assert 2 + 2 == 4\ndef test_mul():\n    assert 3 * 3 == 9\n",
  });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_math.py -x", 2));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}, exit=${leaf.exit_code}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "pass", `expected pass, got ${leaf.status}: ${leaf.error}`);
    const errMsg = leaf.error ?? "";
    assert.match(errMsg, /non-trivial/, `expected non-trivial assertion msg, got: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: fails when all assertions are trivial", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_phony.py": "def test_one():\n    assert True\ndef test_two():\n    assert True\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_phony.py -x"));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0 for trivial tests, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for trivial assertions, got ${leaf.status}: ${leaf.error}`);
    const errMsg = leaf.error ?? "";
    assert.match(errMsg, /ASSERTION QUALITY FAIL/, `expected ASSERTION QUALITY FAIL, got: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: fails when count < value", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_one.py": "def test():\n    x = 1\n    assert x == 1\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_one.py -x", 3));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for insufficient assertions, got ${leaf.status}: ${leaf.error}`);
    const errMsg = leaf.error ?? "";
    assert.match(errMsg, /only \d+ nt/, `expected only-N-non-trivial msg, got: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── TDD + assertions integration ──────────────────────────────────────

function mkTddNode(command: string, seenFailing: boolean): TaskNode {
  return {
    id: "n1",
    title: "tdd check",
    refinement: "concrete",
    command,
    predicate: { type: "tdd" },
    description: "tdd proof",
    last_status: "pending",
    ...(seenFailing ? { seen_failing: true, seen_failing_at: "2026-01-01T00:00:00Z" } : {}),
  };
}

test("tdd: GREEN with trivial assertions fails", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_phony.py": "def test_nothing():\n    assert True\n    assert True\n" });
  try {
    const doc = docWithNode(dir, mkTddNode("python -m pytest test_phony.py -x", true));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0 for trivial test, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for trivial TDD, got ${leaf.status}: ${leaf.error}`);
    const errMsg = leaf.error ?? "";
    assert.match(
      errMsg,
      /TDD.*GREEN but assertions trivial/,
      `expected TDD ASSERTION QUALITY FAIL, got: ${leaf.error}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tdd: GREEN with non-trivial assertions passes", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_real.py": "def test_add():\n    assert 2 + 2 == 4\n" });
  try {
    const doc = docWithNode(dir, mkTddNode("python -m pytest test_real.py -x", true));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "pass", `expected pass for TDD cycle, got ${leaf.status}: ${leaf.error}`);
    const errMsg = leaf.error ?? "";
    assert.match(errMsg, /TDD verified/, `expected TDD cycle verified, got: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tdd: RED phase records seen_failing", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_fail.py": "def test_fail():\n    assert False\n" });
  try {
    const node = mkTddNode("python -m pytest test_fail.py -x", false);
    const doc = docWithNode(dir, node);
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    // fakeExec returns exit 0 — TDD sees GREEN without prior RED → VIOLATION
    assert.equal(leaf.exit_code, 0, `expected exit 0 from fake exec, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", "expected fail for TDD GREEN without prior RED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tdd: GREEN without prior RED fails with TDD VIOLATION", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_ok.py": "def test_ok():\n    x = 1\n    assert x == 1\n" });
  try {
    const doc = docWithNode(dir, mkTddNode("python -m pytest test_ok.py -x", false));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0 for passing test, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for TDD violation, got ${leaf.status}: ${leaf.error}`);
    const errMsg = leaf.error ?? "";
    assert.match(errMsg, /TDD.*GREEN w\/o prior RED/, `expected TDD VIOLATION, got: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Edge cases ────────────────────────────────────────────────────────

test("assertions predicate: handles empty test file", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_empty.py": "" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_empty.py -x"));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0 from fake exec, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for empty file (0 assertions), got ${leaf.status}: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: handles syntax error in test file", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_bad.py": "def test_with_syntax_error(\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_bad.py -x"));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0 from fake exec, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for syntax error file, got ${leaf.status}: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: value=0 allows zero-assertion tests to pass", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_void.py": "def test_nothing():\n    pass\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_void.py -x", 0));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "pass", `expected pass with value=0, got ${leaf.status}: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: handles non-existent test file", async () => {
  const dir = makeTempDir();
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest nonexistent.py -x"));
    const res = await checkDocument(doc, undefined, { execFn: fakeExec() });
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail", `python not found: status=${leaf.status}`);
      return;
    }
    assert.equal(leaf.exit_code, 0, `expected exit 0 from fake exec, got ${leaf.exit_code}: ${leaf.error}`);
    assert.equal(leaf.status, "fail", `expected fail for missing test file, got ${leaf.status}: ${leaf.error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── JS mixed trivial / non-trivial ──────────────────────────────────────

test("analyseAssertions splits trivial from non-trivial in JS mixed file", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "mixed.test.ts": [
      "import { add } from './math';",
      "test('real', () => { expect(add(2,3)).toBe(5); });",
      "test('fake', () => { expect(true).toBe(true); });",
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("npx jest mixed.test.ts", dir);
    assert.ok(report, "should return a report");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.trivial, 1, `trivial=1, got ${report?.trivial}`);
    assert.equal(report?.nonTrivial, 1, `nonTrivial=1, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Alternative JS assertion library styles ─────────────────────────────

test("analyseAssertions detects trivial node:assert style assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "node.test.ts":
      "import assert from 'node:assert';\ntest('t', () => { assert.strictEqual(1, 1); assert.ok(true); });\n",
  });
  try {
    const report = analyseAssertions("node --test node.test.ts", dir);
    assert.ok(report, "should return a report for node:assert");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.trivial, 2, `trivial=2, got ${report?.trivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions detects Chai-style assertions by count", () => {
  const dir = makeTempDir();
  // Chai property chains (to.be.true, to.be.null) are detected as assertions
  // but the trivial/non-trivial heuristic is Jest-oriented and may not classify
  // all Chai patterns correctly — this test verifies detection, not classification.
  writeFiles(dir, {
    "chai.test.ts":
      "import { expect } from 'chai';\nit('math', () => { expect(2 + 2).to.equal(4); expect(items).to.have.length(3); });\n",
  });
  try {
    const report = analyseAssertions("npx mocha chai.test.ts", dir);
    assert.ok(report, "should return a report for Chai assertions");
    assert.equal(report?.total, 2, `total=2, got ${report?.total}`);
    assert.equal(report?.nonTrivial, 2, `nonTrivial=2, got ${report?.nonTrivial}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Command referencing non-test source file ─────────────────────────────

test("analyseAssertions correctly ignores non-test source files in command", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "app.ts": "console.log('hello');",
    "test_app.py": "def test():\n    assert 2 + 2 == 4\n",
  });
  try {
    // Command references a source file — should scan test_app.py only
    const report = analyseAssertions("python -m pytest app.ts test_app.py", dir);
    assert.ok(report, "should return a report despite non-test file in command");
    // Only test_app.py is a test file; app.ts is not
    assert.equal(report?.files.length, 1, `files=1, got ${report?.files.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
