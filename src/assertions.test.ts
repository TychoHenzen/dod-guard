import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyseAssertions } from "./assertions.js";
import { checkDocument } from "./checker.js";
import type { DodDocument, Proof } from "./types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "dod-assertions-"));
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf-8");
  }
}

function docWithAssertionsProof(dir: string, proof: Proof): DodDocument {
  return {
    id: "test-assertions",
    title: "t",
    goal: "g",
    date: "2026-01-01",
    cwd: dir,
    markdown_path: join(dir, "dod.md"),
    created_at: "2026-01-01",
    locked: true,
    sections: { requirements: "r" },
    steps: [{ id: "step-1", title: "Assertions step", proofs: [proof] }],
    amendments: [],
  };
}

// ── Unit: analyseAssertions ───────────────────────────────────────────

test("analyseAssertions returns null when no test files are referenced", () => {
  const dir = makeTempDir();
  writeFiles(dir, { "test_foo.py": "assert True\n" });
  try {
    const report = analyseAssertions("echo hello", dir);
    assert.equal(report, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions detects trivial Python assertions (assert True / assert False)", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_trivial.py": [
      "def test_one():",
      "    assert True",
      "    assert False  # also trivial",
      "",
      "def test_two():",
      "    assert None",
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("python -m pytest test_trivial.py", dir);
    assert.ok(report, "should identify the test file");
    assert.equal(report!.files.length, 1);
    assert.equal(report!.total, 3);
    assert.equal(report!.trivial, 3);
    assert.equal(report!.nonTrivial, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions counts non-trivial Python assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_real.py": [
      "import math",
      "",
      "def test_sqrt():",
      "    assert math.sqrt(4) == 2.0",
      "",
      "def test_upper():",
      '    assert "hello".upper() == "HELLO"',
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("python -m pytest test_real.py", dir);
    assert.ok(report);
    assert.equal(report!.total, 2);
    assert.equal(report!.trivial, 0);
    assert.equal(report!.nonTrivial, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions splits trivial from non-trivial in mixed file", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_mixed.py": [
      "def test_real():",
      "    x = 1 + 1",
      "    assert x == 2",
      "",
      "def test_fake():",
      "    assert True",
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("python -m pytest test_mixed.py", dir);
    assert.ok(report);
    assert.equal(report!.total, 2);
    assert.equal(report!.trivial, 1);
    assert.equal(report!.nonTrivial, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions detects trivial JS assertions (expect(true).toBe(true))", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "example.test.ts": [
      "test('trivial', () => {",
      "  expect(true).toBe(true);",
      "  expect(1).toEqual(1);",
      "});",
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("npx jest example.test.ts", dir);
    assert.ok(report);
    assert.equal(report!.total, 2);
    assert.equal(report!.trivial, 2);
    assert.equal(report!.nonTrivial, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions counts non-trivial JS assertions", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "math.test.ts": [
      "import { add } from './math';",
      "",
      "test('add', () => {",
      "  expect(add(2, 3)).toBe(5);",
      "  expect(add(-1, 1)).toEqual(0);",
      "});",
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("npx jest math.test.ts", dir);
    assert.ok(report);
    assert.equal(report!.total, 2);
    assert.equal(report!.trivial, 0);
    assert.equal(report!.nonTrivial, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions detects trivial assert.equal/assert.strictEqual(const, const)", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "fake.test.ts": [
      "import assert from 'node:assert/strict';",
      "",
      "test('fake', () => {",
      "  assert.equal(1, 1);",
      "  assert.strictEqual(true, true);",
      '  assert.deepEqual("hello", "hello");',
      "});",
    ].join("\n"),
  });
  try {
    const report = analyseAssertions("npx tsx --test fake.test.ts", dir);
    assert.ok(report);
    assert.equal(report!.total, 3);
    assert.equal(report!.trivial, 3);
    assert.equal(report!.nonTrivial, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyseAssertions scans multiple test files referenced in command", () => {
  const dir = makeTempDir();
  writeFiles(dir, {
    "test_a.py": "def test():\n    assert True\n",
    "test_b.py": "def test():\n    x = 1\n    assert x == 1\n",
  });
  try {
    const report = analyseAssertions("python -m pytest test_a.py test_b.py", dir);
    assert.ok(report);
    assert.equal(report!.files.length, 2);
    assert.equal(report!.total, 2);
    assert.equal(report!.trivial, 1);
    assert.equal(report!.nonTrivial, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Integration: assertions predicate through checkDocument ────────────

test("assertions predicate: passes with sufficient non-trivial assertions", async () => {
  const dir = makeTempDir();
  const testFile = "test_math.py";
  writeFiles(dir, {
    [testFile]: [
      "def test_add():",
      "    assert 2 + 2 == 4",
      "",
      "def test_mul():",
      "    assert 3 * 3 == 9",
    ].join("\n"),
  });

  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "assertions", value: 2 },
    description: "Tests contain at least 2 non-trivial assertions",
    last_status: "pending",
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);
    // python may not exist on Windows, but the assertions scan happens anyway
    // — the check is: tests pass AND assertions are non-trivial.
    // If python is missing, the exit code will be non-zero and it'll fail.
    // On a host without python, this test still validates the assertions logic
    // runs (output includes the assertion count).
    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      // python not installed — skip assertions-specific assertions, just verify
      // the check ran (didn't crash)
      assert.equal(res.steps[0].proofs[0].status, "fail");
      assert.match(res.steps[0].proofs[0].error ?? "", /Command not found/);
    } else if (res.steps[0].proofs[0].exit_code === 0) {
      assert.equal(res.steps[0].proofs[0].status, "pass");
      assert.match(res.steps[0].proofs[0].error ?? "", /non-trivial assertion/);
    } else {
      // python exists but pytest returned non-zero (maybe no pytest)
      assert.equal(res.steps[0].proofs[0].status, "fail");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: fails when all assertions are trivial", async () => {
  const dir = makeTempDir();
  const testFile = "test_phony.py";
  writeFiles(dir, {
    [testFile]: [
      "def test_one():",
      "    assert True",
      "",
      "def test_two():",
      "    assert True",
    ].join("\n"),
  });

  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "assertions" },
    description: "Tests contain real assertions",
    last_status: "pending",
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);

    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      // python not installed — check still ran, failed on missing tool
      assert.equal(res.steps[0].proofs[0].status, "fail");
    } else if (res.steps[0].proofs[0].error?.includes("ASSERTION QUALITY FAIL")) {
      // The assertions checker caught the trivial assertions
      assert.equal(res.steps[0].proofs[0].status, "fail");
      assert.match(res.steps[0].proofs[0].error ?? "", /ASSERTION QUALITY FAIL/);
      assert.match(res.steps[0].proofs[0].error ?? "", /trivial/);
    } else {
      // python exists and ran (exit 0 with trivial assertions), or failed for
      // another reason. If exit 0, the assertions predicate should have caught it.
      // If exit != 0, the tests just failed normally.
      assert.equal(res.steps[0].proofs[0].status, "fail");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assertions predicate: fails when non-trivial count < value", async () => {
  const dir = makeTempDir();
  const testFile = "test_one.py";
  writeFiles(dir, {
    [testFile]: "def test():\n    x = 1\n    assert x == 1\n",
  });

  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "assertions", value: 3 },
    description: "Tests need at least 3 non-trivial assertions",
    last_status: "pending",
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);

    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      assert.equal(res.steps[0].proofs[0].status, "fail");
    } else if (res.steps[0].proofs[0].exit_code === 0) {
      assert.equal(res.steps[0].proofs[0].status, "fail");
      assert.match(res.steps[0].proofs[0].error ?? "", /only \d+ non-trivial/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── TDD + assertions integration ──────────────────────────────────────
//
// The tdd predicate now bakes in assertion-quality checks. A TDD proof that
// passes the RED→GREEN cycle but contains only trivial assertions (assert True,
// expect(true).toBe(true)) is rejected — closing the "grep for assert keyword"
// loophole at the predicate level.

test("tdd predicate: GREEN with trivial assertions fails with TDD ASSERTION QUALITY FAIL", async () => {
  const dir = makeTempDir();
  const testFile = "test_phony.py";
  writeFiles(dir, {
    [testFile]: [
      "def test_nothing():",
      "    assert True",
      "    assert True",
    ].join("\n"),
  });

  // Simulate a tdd proof that has already been through RED phase
  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "tdd" },
    description: "TDD: test_add",
    last_status: "pending",
    seen_failing: true,
    seen_failing_at: "2026-01-01T00:00:00Z",
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);

    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      // python not installed — check still ran, failed on missing tool
      assert.equal(res.steps[0].proofs[0].status, "fail");
    } else if (res.steps[0].proofs[0].exit_code === 0) {
      // Tests pass but assertions are trivial → must fail
      assert.equal(res.steps[0].proofs[0].status, "fail");
      assert.match(res.steps[0].proofs[0].error ?? "", /TDD ASSERTION QUALITY FAIL/);
      assert.match(res.steps[0].proofs[0].error ?? "", /trivial/);
    }
    // If python exists but pytest missing → exit != 0, normal fail
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tdd predicate: GREEN with non-trivial assertions passes with assertion note", async () => {
  const dir = makeTempDir();
  const testFile = "test_real.py";
  writeFiles(dir, {
    [testFile]: [
      "def test_add():",
      "    assert 2 + 2 == 4",
    ].join("\n"),
  });

  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "tdd" },
    description: "TDD: test_add",
    last_status: "pending",
    seen_failing: true,
    seen_failing_at: "2026-01-01T00:00:00Z",
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);

    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      assert.equal(res.steps[0].proofs[0].status, "fail");
    } else if (res.steps[0].proofs[0].exit_code === 0) {
      assert.equal(res.steps[0].proofs[0].status, "pass");
      assert.match(res.steps[0].proofs[0].error ?? "", /TDD cycle verified/);
      assert.match(res.steps[0].proofs[0].error ?? "", /non-trivial/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tdd predicate: RED phase still works (records seen_failing, no assertion check)", async () => {
  const dir = makeTempDir();
  const testFile = "test_will_fail.py";
  writeFiles(dir, {
    [testFile]: "def test_fail():\n    assert False\n",
  });

  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "tdd" },
    description: "TDD: test_fail (RED)",
    last_status: "pending",
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);

    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      assert.equal(res.steps[0].proofs[0].status, "fail");
    } else {
      // RED phase: test fails → status "fail", seen_failing gets set
      assert.equal(res.steps[0].proofs[0].status, "fail");
      // The proof should now have seen_failing = true
      assert.equal(proof.seen_failing, true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("tdd predicate: GREEN without prior RED fails with TDD VIOLATION", async () => {
  const dir = makeTempDir();
  const testFile = "test_passes.py";
  writeFiles(dir, {
    [testFile]: "def test_ok():\n    x = 1\n    assert x == 1\n",
  });

  const proof: Proof = {
    id: "proof-1-1",
    command: `python -m pytest ${testFile} -x`,
    predicate: { type: "tdd" },
    description: "TDD: test_ok (no RED)",
    last_status: "pending",
    // seen_failing NOT set — simulates skipping RED phase
  };

  try {
    const doc = docWithAssertionsProof(dir, proof);
    const res = await checkDocument(doc);

    if (res.steps[0].proofs[0].error?.includes("Command not found")) {
      assert.equal(res.steps[0].proofs[0].status, "fail");
    } else if (res.steps[0].proofs[0].exit_code === 0) {
      // Test passes but was never seen failing
      assert.equal(res.steps[0].proofs[0].status, "fail");
      assert.match(res.steps[0].proofs[0].error ?? "", /TDD VIOLATION/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
