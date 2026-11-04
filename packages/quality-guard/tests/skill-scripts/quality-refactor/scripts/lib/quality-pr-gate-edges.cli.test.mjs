import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { lineOf } from "./formatter-width-test-support.mjs";
import {
  git,
  pullRequest,
  runBareGate,
  runGate,
} from "./quality-pr-gate-cli-test-support.mjs";

// No biome.json in these repos, so LONG is a medium finding under the
// scanner's fallback 80/120 limits.
const LONG = lineOf(100);
const SHORT = "x();";

test("an unchanged tree reports no changed files and writes nothing", (t) => {
  const repo = pullRequest(t, {
    base: `${SHORT}\n`,
    head: `${SHORT}\n// edit\n`,
  });
  git(repo, "reset", "-q", "--hard", "main");
  const result = runGate(repo);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no changed files/);
  assert.equal(existsSync(result.report), false);
});

test("a base that cannot be resolved is an error, not a pass", (t) => {
  const repo = pullRequest(t, { base: `${SHORT}\n`, head: `${LONG}\n` });
  const result = runBareGate(repo, "--base=nope", "--root=src");
  assert.equal(result.status, 2);
});

test("deleting a file that carried a finding pays the cleanup quota", (t) => {
  const repo = pullRequest(t, { base: `${LONG}\n`, head: `${SHORT}\n` });
  git(repo, "rm", "-q", "src/a.js");
  git(repo, "commit", "-q", "-m", "delete");
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quota met/);
  assert.match(result.stdout, /removed 1 pre-existing finding/);
  assert.match(result.stdout, /a\.js:1` line-length/);
  assert.match(
    readFileSync(result.comment, "utf8"),
    /Pre-existing findings removed by this pull request \(1\)/,
  );
});

test("a long line added elsewhere is new even when a deleted file carried one", (t) => {
  const repo = pullRequest(t, {
    base: { "src/a.js": `${LONG}\n` },
    head: {
      "src/a.js": `${LONG}\n`,
      "src/b.js": `x(${"b".repeat(LONG.length - 4)});\n`,
    },
  });
  git(repo, "rm", "-q", "src/a.js");
  git(repo, "commit", "-q", "-m", "move");
  const result = runGate(repo);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /b\.js:1 line-length/);
  assert.match(result.stderr, /block this pull request/);
});

test("renaming the source dir does not make its findings new", (t) => {
  const repo = pullRequest(t, {
    base: `${LONG}\n`,
    head: `${LONG}\n// edit\n`,
  });
  git(repo, "mv", "src", "lib");
  git(repo, "commit", "-q", "-m", "rename");
  const result = runGate(
    repo,
    "--root=lib",
    "--fix-medium-high=0",
    "--fix-low=0",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /line-length/);
});
