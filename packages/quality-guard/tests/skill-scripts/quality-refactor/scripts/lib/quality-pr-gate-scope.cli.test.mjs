import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lineOf, writeTree } from "./formatter-width-test-support.mjs";
import {
  git,
  pullRequest,
  runBareGate,
  runGate,
} from "./quality-pr-gate-cli-test-support.mjs";

// No biome.json in these repos, so LONG is a medium finding under the
// scanner's fallback 80/120 limits.
const LONG = lineOf(100);

const INVALID_SETTING_BASE = {
  ".quality-guard.json": "{",
  "src/a.js": "x();\n",
};

const reportText = (path) => readFileSync(path, "utf8");

test("a changed file outside any former root is judged", (t) => {
  const repo = pullRequest(t, {
    base: { "plugins/p/a.js": "x();\n" },
    head: { "plugins/p/a.js": `${LONG}\n` },
  });
  const result = runGate(repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /plugins\/p\/a\.js/);
});

test("a finding identical at base and head does not block", (t) => {
  const repo = pullRequest(t, {
    base: { "plugins/p/a.js": `${LONG}\n` },
    head: { "plugins/p/a.js": `${LONG}\n// edit\n` },
  });
  const result = runGate(repo, "--fix-medium-high=0", "--fix-low=0");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /line-length/);
});

test("excludePaths from the merge base removes a directory from both scans", (t) => {
  const repo = pullRequest(t, {
    base: {
      ".quality-guard.json": '{"excludePaths":["/samples/"]}',
      "samples/v.js": "x();\n",
      "src/a.js": "x();\n",
    },
    head: { "samples/v.js": `${LONG}\n` },
  });
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /samples/);
  const report = reportText(result.report);
  assert.match(report, /Changed files skipped by an exclusion/);
  assert.match(report, /samples\/v\.js/);
});

test("a pull request cannot exclude its own findings", (t) => {
  const repo = pullRequest(t, {
    base: { "src/a.js": "x();\n" },
    head: {
      ".quality-guard.json": '{"excludePaths":["/src/"]}',
      "src/a.js": `${LONG}\n`,
    },
  });
  const result = runGate(repo);
  assert.equal(result.status, 1);
  assert.match(reportText(result.report), /changes \.quality-guard\.json/);
});

test("a scan of zero files fails closed", (t) => {
  const repo = pullRequest(t, {
    base: { "README.md": "a\n" },
    head: { "README.md": "b\n" },
  });
  const result = runGate(repo);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /covered no files/);
});

test("an invalid setting exits 2 and names the file", (t) => {
  const repo = pullRequest(t, {
    base: INVALID_SETTING_BASE,
    head: { "src/a.js": "x();\n// edit\n" },
  });
  const result = runGate(repo);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\.quality-guard\.json/);
  assert.match(result.stderr, /Fix the file/);
});

test("--root is rejected", (t) => {
  const repo = pullRequest(t, {
    base: { "src/a.js": "x();\n" },
    head: { "src/a.js": `${LONG}\n` },
  });
  const result = runBareGate(repo, "--base=main", "--root=src");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /excludePaths/);
});

test("a corrected setting passes with no other change", (t) => {
  const repo = pullRequest(t, {
    base: INVALID_SETTING_BASE,
    head: { "src/a.js": "x();\n// edit\n" },
  });
  git(repo, "checkout", "-q", "main");
  writeTree(repo, { ".quality-guard.json": "{}" });
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "fix setting");
  git(repo, "checkout", "-q", "feature");
  git(repo, "rebase", "-q", "main");
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
});
