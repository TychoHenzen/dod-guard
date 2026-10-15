// Each repository writes its biome.json at test time, because a tracked
// fixture biome.json would be read by Biome itself as a nested config.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lineOf } from "./formatter-width-test-support.mjs";
import { pullRequest, runGate } from "./quality-pr-gate-cli-test-support.mjs";

const SHORT = "x();";
const biomeAt = (lineWidth) => ({ formatter: { lineWidth } });

function width120Change(t, length) {
  return pullRequest(t, {
    base: { "biome.json": biomeAt(120), "src/a.js": `${SHORT}\n` },
    head: `${SHORT}\n${lineOf(length)}\n`,
  });
}

test("a width-120 config lets a new 100-char line through", (t) => {
  const result = runGate(width120Change(t, 100), "--block-on=high");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(readFileSync(result.report, "utf8"), /line-length/);
});

test("a width-120 config blocks a new 130-char line as high", (t) => {
  const result = runGate(width120Change(t, 130), "--block-on=high");
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /src\/a\.js:2 line-length: line is 130 chars \(width 120\)/,
  );
  assert.match(
    readFileSync(result.report, "utf8"),
    /line-length \(high\): line is 130 chars/,
  );
});

// The long lines stay put and the head only appends a short line: the gate
// compares only files the pull request changed, so a.js must be touched for
// its base findings, judged by the base worktree's width-80 config, to show.
test("widening the formatter resolves findings on the base side", (t) => {
  const long = `${lineOf(90)}\n${lineOf(110)}\n`;
  const repo = pullRequest(t, {
    base: { "biome.json": biomeAt(80), "src/a.js": long },
    head: { "biome.json": biomeAt(120), "src/a.js": `${long}${SHORT}\n` },
  });
  const result = runGate(repo);
  assert.equal(result.status, 0, result.stderr);
  const report = readFileSync(result.report, "utf8");
  assert.match(report, /removed by this pull request \(2\)/);
  assert.match(report, /a\.js:1` line-length \(medium\).*\(width 80\)/);
  assert.match(report, /a\.js:2` line-length \(medium\).*\(width 80\)/);
  assert.doesNotMatch(report, /## New findings/);
  assert.doesNotMatch(report, /still open|grew/);
});

// A config the scanner cannot read must never turn the gate into an
// internal error (exit 2); the line falls back to the fixed 80/120 limits.
test("an unparseable biome.json falls back instead of failing", (t) => {
  const repo = pullRequest(t, {
    base: `${SHORT}\n`,
    head: { "biome.json": "{ not json", "src/a.js": `${lineOf(90)}\n` },
  });
  const result = runGate(repo);
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /src\/a\.js:1 line-length: line is 90 chars \(width 80\)/,
  );
  assert.match(
    readFileSync(result.report, "utf8"),
    /line-length \(medium\): line is 90 chars \(width 80\)/,
  );
});
