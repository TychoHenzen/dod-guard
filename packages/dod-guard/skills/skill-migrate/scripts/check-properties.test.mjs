import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { checkSyntax, behaviorScore, checkMutationsFixed, checkNewIssues, LANG_CHECKERS } from "./check-properties.mjs";

const CLI_PATH = fileURLToPath(new URL("./check-properties.mjs", import.meta.url));

function tempFile(name, content) {
  const dir = mkdtempSync(join(tmpdir(), "check-properties-"));
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

test("checkSyntax: valid JS returns true", () => {
  const filePath = tempFile("valid.js", "const x = 1;\nmodule.exports = x;\n");
  const result = checkSyntax(filePath, "js");
  assert.equal(result.valid, true);
});

test("checkSyntax: invalid JS returns false", () => {
  const filePath = tempFile("invalid.js", "function totallyBroken( {\n  return\n");
  const result = checkSyntax(filePath, "js");
  assert.equal(result.valid, false);
  assert.ok(result.error && result.error.length > 0);
});

test("behaviorScore: identical files score 1.0", () => {
  const content = "line one\nline two\nline three\n";
  assert.equal(behaviorScore(content, content), 1.0);
});

test("behaviorScore: changed files score below 1.0", () => {
  const original = "line one\nline two\nline three\n";
  const changed = "line one\nCHANGED\nline three\n";
  const score = behaviorScore(original, changed);
  assert.ok(score < 1.0);
  assert.ok(score > 0);
});

test("checkMutationsFixed: counts restored mutations against a sidecar", () => {
  const mutations = [
    { before: "foo", after: "bar" },
    { before: "baz", after: "qux" },
  ];
  const resultContent = "const foo = 1;\nconst qux = 2;\n";
  const outcome = checkMutationsFixed(mutations, resultContent);
  assert.deepEqual(outcome, { fixed: 1, total: 2 });
});

test("checkNewIssues: flags growth in line count and nesting depth", () => {
  const original = "function f() {\n  return 1;\n}\n";
  const result = "function f() {\n  if (true) {\n    return 1;\n  }\n}\n";
  const issues = checkNewIssues(original, result, "js");
  assert.ok(issues.some((i) => i.includes("nesting depth increased")));
});

test("checkSyntax: missing tooling returns null instead of failing", () => {
  // node --test (per this skill's verify command) runs without
  // --experimental-test-module-mocks, so mock.module is unavailable here.
  // Exercise the real ENOENT path instead: point a throwaway language entry
  // at a binary that cannot exist, then confirm graceful degradation to null.
  LANG_CHECKERS.__nonexistentTestLang__ = {
    cmd: "definitely-not-a-real-binary-check-properties-test",
    args: (f) => [f],
  };
  try {
    const result = checkSyntax("whatever.txt", "__nonexistentTestLang__");
    assert.equal(result.valid, null);
    assert.equal(result.error, null);
  } finally {
    delete LANG_CHECKERS.__nonexistentTestLang__;
  }
});

test("CLI: exit 3 with usage message on missing --original or --result", () => {
  assert.throws(
    () => {
      execFileSync(process.execPath, [CLI_PATH, "--result=foo.js"], { stdio: "pipe" });
    },
    (err) => {
      assert.equal(err.status, 3);
      assert.ok(err.stderr.toString().includes("Usage:"));
      return true;
    },
  );

  assert.throws(
    () => {
      execFileSync(process.execPath, [CLI_PATH, "--original=foo.js"], { stdio: "pipe" });
    },
    (err) => {
      assert.equal(err.status, 3);
      assert.ok(err.stderr.toString().includes("Usage:"));
      return true;
    },
  );
});
