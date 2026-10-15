import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pullRequest, runGate } from "./quality-pr-gate-cli-test-support.mjs";

// No biome.json in these repos, so lines are judged by
// the scanner's fallback 80/120 limits: over medium, under high.
const LONG_LINE = `const label = "${"x".repeat(90)}";`;
const SHORT_LINE = 'const label = "short";';

test("a pull request that adds a medium finding is blocked", (t) => {
  const repo = pullRequest(t, {
    base: `${SHORT_LINE}\n`,
    head: `${SHORT_LINE}\n${LONG_LINE}\n`,
  });
  const result = runGate(repo);
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /src\/a\.js:2 line-length: line is 107 chars \(width 80\)/,
  );
  assert.match(
    readFileSync(result.comment, "utf8"),
    /^<!-- quality-pr-gate -->/,
  );
});

test("an old finding does not block, but the quota still needs one", (t) => {
  const head = `${LONG_LINE}\n${SHORT_LINE.replace("label", "other")}\n`;
  const repo = pullRequest(t, { base: `${LONG_LINE}\n`, head });
  const result = runGate(repo);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /line-length/);
  assert.match(result.stderr, /quota NOT met/);
  assert.match(
    readFileSync(result.report, "utf8"),
    /Pre-existing findings still open in the changed files \(1\)/,
  );
});

test("removing a pre-existing finding satisfies the quota", (t) => {
  const repo = pullRequest(t, {
    base: `${LONG_LINE}\n`,
    head: `${SHORT_LINE}\n`,
  });
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quota met/);
  assert.match(
    readFileSync(result.report, "utf8"),
    /removed by this pull request \(1\)/,
  );
});

test("a per-rule override lets a new line-length finding through", (t) => {
  const head = `${LONG_LINE}\n${LONG_LINE.replace("label", "more")}\n`;
  const repo = pullRequest(t, { base: `${LONG_LINE}\n`, head });
  const blocked = runGate(repo);
  assert.equal(blocked.status, 1);
  const allowed = runGate(
    repo,
    "--rule-block-on=line-length:high",
    "--fix-medium-high=0",
    "--fix-low=0",
  );
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.match(
    readFileSync(allowed.comment, "utf8"),
    /below the blocking threshold: 1/,
  );
});
