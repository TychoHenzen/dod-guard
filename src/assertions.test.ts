import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyseAssertions } from "./assertions.js";
import { checkDocument } from "./checker.js";
import type { DodDocument, TaskNode } from "./types.js";

function makeTempDir(): string { return mkdtempSync(join(tmpdir(), "dod-assertions-")); }

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf-8");
}

function docWithNode(dir: string, node: TaskNode): DodDocument {
  return {
    id: "test-assertions", title: "t", goal: "g", date: "2026-01-01",
    cwd: dir, markdown_path: join(dir, "dod.md"), created_at: "2026-01-01",
    sections: { requirements: "r" },
    roots: [node],
    amendments: [],
  };
}

// ── Unit: analyseAssertions ───────────────────────────────────────────

test("analyseAssertions returns null when no test files are referenced", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_foo.py": "assert True\n" });
  try { assert.equal(analyseAssertions("echo hello", dir), null); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyseAssertions detects trivial Python assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_trivial.py": "def test_one():\n    assert True\n    assert False\ndef test_two():\n    assert None\n" });
  try {
    const report = analyseAssertions("python -m pytest test_trivial.py", dir);
    assert.ok(report); assert.equal(report!.total, 3); assert.equal(report!.trivial, 3); assert.equal(report!.nonTrivial, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyseAssertions counts non-trivial Python assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_real.py": "import math\ndef test_sqrt():\n    assert math.sqrt(4) == 2.0\ndef test_upper():\n    assert 'hello'.upper() == 'HELLO'\n" });
  try {
    const report = analyseAssertions("python -m pytest test_real.py", dir);
    assert.ok(report); assert.equal(report!.total, 2); assert.equal(report!.nonTrivial, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyseAssertions splits trivial from non-trivial in mixed file", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_mixed.py": "def test_real():\n    x = 1 + 1\n    assert x == 2\ndef test_fake():\n    assert True\n" });
  try {
    const report = analyseAssertions("python -m pytest test_mixed.py", dir);
    assert.ok(report); assert.equal(report!.total, 2); assert.equal(report!.trivial, 1); assert.equal(report!.nonTrivial, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyseAssertions detects trivial JS assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "e.test.ts": "test('t', () => { expect(true).toBe(true); expect(1).toEqual(1); });\n" });
  try {
    const report = analyseAssertions("npx jest e.test.ts", dir);
    assert.ok(report); assert.equal(report!.total, 2); assert.equal(report!.trivial, 2); assert.equal(report!.nonTrivial, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyseAssertions counts non-trivial JS assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "m.test.ts": "import { add } from './math';\ntest('add', () => { expect(add(2,3)).toBe(5); expect(add(-1,1)).toEqual(0); });\n" });
  try {
    const report = analyseAssertions("npx jest m.test.ts", dir);
    assert.ok(report); assert.equal(report!.total, 2); assert.equal(report!.nonTrivial, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("analyseAssertions scans multiple test files", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_a.py": "def test():\n    assert True\n", "test_b.py": "def test():\n    x = 1\n    assert x == 1\n" });
  try {
    const report = analyseAssertions("python -m pytest test_a.py test_b.py", dir);
    assert.ok(report); assert.equal(report!.files.length, 2); assert.equal(report!.total, 2); assert.equal(report!.trivial, 1); assert.equal(report!.nonTrivial, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Integration: assertions predicate through checkDocument ────────────

function mkAssertionNode(command: string, value?: number): TaskNode {
  return {
    id: "n1", title: "assertion check", refinement: "concrete",
    command, predicate: { type: "assertions", value },
    description: "assertions proof", last_status: "pending",
  };
}

test("assertions predicate: passes with sufficient non-trivial assertions", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_math.py": "def test_add():\n    assert 2 + 2 == 4\ndef test_mul():\n    assert 3 * 3 == 9\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_math.py -x", 2));
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else if (leaf.exit_code === 0) {
      assert.equal(leaf.status, "pass");
      assert.match(leaf.error ?? "", /non-trivial assertion/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("assertions predicate: fails when all assertions are trivial", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_phony.py": "def test_one():\n    assert True\ndef test_two():\n    assert True\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_phony.py -x"));
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else if (leaf.error?.includes("ASSERTION QUALITY FAIL")) {
      assert.equal(leaf.status, "fail");
      assert.match(leaf.error ?? "", /trivial/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("assertions predicate: fails when count < value", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_one.py": "def test():\n    x = 1\n    assert x == 1\n" });
  try {
    const doc = docWithNode(dir, mkAssertionNode("python -m pytest test_one.py -x", 3));
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else if (leaf.exit_code === 0) {
      assert.equal(leaf.status, "fail");
      assert.match(leaf.error ?? "", /only \d+ non-trivial/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── TDD + assertions integration ──────────────────────────────────────

function mkTddNode(command: string, seenFailing: boolean): TaskNode {
  return {
    id: "n1", title: "tdd check", refinement: "concrete",
    command, predicate: { type: "tdd" }, description: "tdd proof",
    last_status: "pending",
    ...(seenFailing ? { seen_failing: true, seen_failing_at: "2026-01-01T00:00:00Z" } : {}),
  };
}

test("tdd: GREEN with trivial assertions fails", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_phony.py": "def test_nothing():\n    assert True\n    assert True\n" });
  try {
    const doc = docWithNode(dir, mkTddNode("python -m pytest test_phony.py -x", true));
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else if (leaf.exit_code === 0) {
      assert.equal(leaf.status, "fail");
      assert.match(leaf.error ?? "", /TDD ASSERTION QUALITY FAIL/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("tdd: GREEN with non-trivial assertions passes", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_real.py": "def test_add():\n    assert 2 + 2 == 4\n" });
  try {
    const doc = docWithNode(dir, mkTddNode("python -m pytest test_real.py -x", true));
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else if (leaf.exit_code === 0) {
      assert.equal(leaf.status, "pass");
      assert.match(leaf.error ?? "", /TDD cycle verified/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("tdd: RED phase records seen_failing", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_fail.py": "def test_fail():\n    assert False\n" });
  try {
    const node = mkTddNode("python -m pytest test_fail.py -x", false);
    const doc = docWithNode(dir, node);
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else {
      assert.equal(node.seen_failing, true);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("tdd: GREEN without prior RED fails with TDD VIOLATION", async () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_ok.py": "def test_ok():\n    x = 1\n    assert x == 1\n" });
  try {
    const doc = docWithNode(dir, mkTddNode("python -m pytest test_ok.py -x", false));
    const res = await checkDocument(doc);
    const leaf = res.leaves[0];
    if (leaf.error?.includes("Command not found")) {
      assert.equal(leaf.status, "fail");
    } else if (leaf.exit_code === 0) {
      assert.equal(leaf.status, "fail");
      assert.match(leaf.error ?? "", /TDD VIOLATION/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
