import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gate } from "../../scripts/quality-guard-gate.mjs";
import {
  FILE_RULES,
  runScanner,
} from "../../scripts/quality-guard-gate-scan.mjs";
import { hardBoundFindings } from "../../scripts/quality-guard-gate-support.mjs";
import {
  fakeInput,
  gateDeps,
  testTarget,
  tempRepo,
  writeTarget,
} from "./git-tracked-adoption-fixtures.test.mjs";

function gateWith(filePath, calls, scan) {
  return gate(
    fakeInput(filePath),
    filePath,
    gateDeps({
      runScanner: () => {
        calls.push("scanner");
        return scan;
      },
      localResult: () => {
        calls.push("linter");
        return 0;
      },
    }),
  );
}

test("the file-local rule set excludes project reachability rules", () => {
  assert.match(FILE_RULES, /file-length/);
  assert.match(FILE_RULES, /wildcard-import/);
  assert.doesNotMatch(FILE_RULES, /duplicate-block/);
  assert.doesNotMatch(FILE_RULES, /dead-export/);
  assert.doesNotMatch(FILE_RULES, /test-only-export/);
});

test("the file-local scanner reports Python wildcard imports", () => {
  const root = tempRepo();
  const filePath = writeTarget(root, "wild.py", 1);
  writeFileSync(filePath, "from package import *\n");
  try {
    const scan = runScanner(filePath, root);
    assert.ok(
      scan?.violations.some(
        (violation) => violation.rule === "wildcard-import",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function partialClass(lines) {
  const body = "    public int Value() => 1;\n".repeat(lines);
  return `public partial class Board\n{\n${body}}\n`;
}

test("the file-local scan measures a split partial class as one class", () => {
  const root = tempRepo();
  const filePath = join(root, "Board.cs");
  writeFileSync(filePath, partialClass(200));
  writeFileSync(join(root, "Board.Moves.cs"), partialClass(200));
  try {
    const scan = runScanner(filePath, root);
    const finding = scan?.violations.find(
      (violation) => violation.rule === "partial-type-length",
    );
    assert.equal(finding?.severity, "error");
    const [line] = hardBoundFindings([finding]);
    assert.match(line, /partial-type-length: partial class Board spans 2 files/);
    assert.match(line, /\n {2}Fix: A partial class is still one class/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the project linter runs after a passing structural check", () => {
  const { root, filePath } = testTarget("clean.js");
  const calls = [];
  const code = gateWith(filePath, calls, { violations: [] });
  assert.equal(code, 0);
  assert.deepEqual(calls, ["scanner", "linter"]);
  rmSync(root, { recursive: true, force: true });
});

test("a target outside a repository is a successful no-op", () => {
  const root = mkdtempSync(join(tmpdir(), "qg-external-"));
  writeFileSync(join(root, "scratch.py"), "def scratch():\n    return 1\n");
  const calls = [];
  const target = join(root, "scratch.py");
  const code = gate(fakeInput(target), target, {
    runScanner: () => calls.push("scanner"),
    localResult: () => calls.push("linter"),
  });
  assert.equal(code, 0);
  assert.deepEqual(calls, []);
  rmSync(root, { recursive: true, force: true });
});
