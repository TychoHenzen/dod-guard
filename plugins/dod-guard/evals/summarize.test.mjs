import assert from "node:assert/strict";
import { test as it } from "node:test";
import { caseRow, mergeCases, summarize } from "./summarize.mjs";

const INDICATOR_BASELINE_NA = /indicator-y 1\/2 \(baseline n\/a\)/u;
const SCORED_WITH_BASELINE = /not-x 1\/2 \(baseline 2\/2\)/u;
const NEGATIVE_SCORES = /\| 0\.50 \| 1\.00 \| -0\.50 \|/u;
const POSITIVE_ROW = /\| 1\.00 \| 0\.00 \| \+1\.00 \| fires-x 1\/1 \(baseline 0\/1\) \|/u;
const SINGLE_ARM_ROW = /\| 1\.00 \| n\/a \| n\/a \| fires-x 1\/1 \(baseline n\/a\) \|/u;
const HEADER =
  /^# Skill trigger eval results\n\nClaude Code 2\.1\.331, model claude-opus-5-5, first run started 2026-11-28T07:00:00Z, 2 result file\(s\), \$3\.25 in total\./u;

const grader = (name, passed) => ({ name, passed });
const run = (...graders) => ({ graders });

// One of two with-plugin runs lets the target skill fire when firstRunStayedOut is false.
function negativeCase(name, firstRunStayedOut, aggregates) {
  return {
    name,
    arms: {
      with: [
        run(grader("not-x", firstRunStayedOut), grader("indicator-y", true)),
        run(grader("not-x", true), grader("indicator-y", false)),
      ],
      without: [run(grader("not-x", true)), run(grader("not-x", true))],
    },
    aggregates,
  };
}

const halfMissed = { score: 0.5, scoreWithout: 1, delta: -0.5 };
const LATER_COST = 1.25;
const EARLIER_COST = 2;
const clean = { score: 1, scoreWithout: 1, delta: 0 };

it("a with-only grader reports n/a for the baseline, not zero", () => {
  const row = caseRow(negativeCase("x--not-for-y", false, halfMissed));
  assert.match(row, INDICATOR_BASELINE_NA);
  assert.match(row, SCORED_WITH_BASELINE);
  assert.match(row, NEGATIVE_SCORES);
});

it("a positive delta is signed and a single-arm case has no baseline or delta", () => {
  const positive = {
    name: "x--fires",
    arms: { with: [run(grader("fires-x", true))], without: [run(grader("fires-x", false))] },
    aggregates: { score: 1, scoreWithout: 0, delta: 1 },
  };
  assert.match(caseRow(positive), POSITIVE_ROW);
  const singleArm = { name: "x--one-arm", arms: { with: [run(grader("fires-x", true))] }, aggregates: { score: 1 } };
  assert.match(caseRow(singleArm), SINGLE_ARM_ROW);
});

it("a case in a later result file replaces the earlier result", () => {
  const first = { cases: [negativeCase("b", false, halfMissed), negativeCase("a", true, clean)] };
  const rerun = { cases: [negativeCase("b", true, clean)] };
  const merged = mergeCases([first, rerun]);
  assert.deepEqual(
    merged.map((c) => c.name),
    ["a", "b"],
  );
  assert.equal(merged[1].aggregates.score, 1);
});

it("the header names the version, model, earliest start, and summed cost", () => {
  const result = (startedAt, costUsd) => ({
    claudeVersion: "2.1.331",
    suite: { modelOverride: "claude-opus-5-5" },
    startedAt,
    costUsd,
    cases: [],
  });
  const text = summarize([result("2026-11-28T08:00:00Z", LATER_COST), result("2026-11-28T07:00:00Z", EARLIER_COST)]);
  assert.match(text, HEADER);
});
