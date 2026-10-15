import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
