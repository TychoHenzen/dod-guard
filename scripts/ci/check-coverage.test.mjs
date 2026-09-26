import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { main, mergeBaseline, parseArgs, readReviewedDecreaseEvidence, writeBaseline } from "./check-coverage.mjs";

const MATCHING_DECREASE_ERROR = /does not match quality-guard:branches/;
const MISSING_DECREASE_ERROR = /at least one decrease/;
const MISSING_WRITE_FLAG_ERROR = /requires --write-baseline/;
const UNREVIEWED_DECREASE_ERROR = /unreviewed baseline decrease/;
const FINITE_METRIC_ERROR = /must be a finite number/;
const INVALID_METRICS_ERROR = /has invalid metrics/;
const TRACKED_EVIDENCE_ERROR = /tracked in git/;

const baseline = {
  "quality-guard": {
    statements: 95.44,
    branches: 89.08,
    functions: 95.89,
    lines: 95.44,
  },
  fossil: {
    statements: 98.47,
    branches: 86.84,
    functions: 99.76,
    lines: 98.47,
  },
  "knowledge-base": {
    statements: 93.74,
    branches: 79.25,
    functions: 95.45,
    lines: 93.74,
  },
};

const current = {
  "quality-guard": {
    statements: 95.52,
    branches: 89.03,
    functions: 95.9,
    lines: 95.52,
  },
  fossil: { ...baseline.fossil },
  "knowledge-base": {
    statements: 94.92,
    branches: 80.85,
    functions: 100,
    lines: 94.92,
  },
};

const improvedCurrent = {
  ...current,
  "quality-guard": { ...current["quality-guard"], branches: baseline["quality-guard"].branches },
};

function withTemporaryBaseline(callback) {
  const directory = mkdtempSync(join(tmpdir(), "check-coverage-"));
  const path = join(directory, "coverage-baseline.json");
  try {
    writeBaseline(baseline, path);
    return callback(path, readFileSync(path));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("rejects an unreviewed decrease before producing a baseline", () => {
  assert.throws(() => mergeBaseline(current, baseline), UNREVIEWED_DECREASE_ERROR);
});

test("adopts improvements while preserving every existing floor", () => {
  const result = mergeBaseline(improvedCurrent, baseline);

  assert.deepEqual(result.packages, {
    "quality-guard": {
      statements: 95.52,
      branches: 89.08,
      functions: 95.9,
      lines: 95.52,
    },
    fossil: baseline.fossil,
    "knowledge-base": current["knowledge-base"],
  });
  assert.deepEqual(result.drops, []);
  assert.equal(result.approved.size, 0);
});

test("allows only an exactly matching reviewed decrease record", () => {
  const result = mergeBaseline(current, baseline, {
    reviewed: true,
    reviewer: "TychoHenzen",
    issue: 515,
    decreases: [
      {
        package: "quality-guard",
        metric: "branches",
        from: 89.08,
        to: 89.03,
        reason: "Reviewed measurement change for the baseline owner PBI.",
      },
    ],
  });

  assert.equal(result.packages["quality-guard"].branches, 89.03);
  assert.equal(result.approved.has("quality-guard:branches"), true);
});

test("rejects incomplete or stale reviewed-decrease evidence before a write", () => {
  assert.throws(
    () =>
      mergeBaseline(current, baseline, {
        reviewed: true,
        reviewer: "TychoHenzen",
        issue: 515,
        decreases: [
          {
            package: "quality-guard",
            metric: "branches",
            from: 89.08,
            to: 89.02,
            reason: "Stale evidence must not authorize a different measurement.",
          },
        ],
      }),
    MATCHING_DECREASE_ERROR,
  );

  assert.throws(
    () =>
      mergeBaseline(current, baseline, {
        reviewed: true,
        reviewer: "TychoHenzen",
        issue: 515,
        decreases: [],
      }),
    MISSING_DECREASE_ERROR,
  );
});

test("CLI write path refuses an unreviewed decrease and preserves the file", () => {
  withTemporaryBaseline((path, before) => {
    const exitCode = main(["--write-baseline"], {
      measure: () => current,
      baselinePath: path,
      stderr: { write() {} },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(readFileSync(path), before);
  });
});

test("CLI write path applies only matching reviewed evidence", () => {
  withTemporaryBaseline((path) => {
    const exitCode = main(["--write-baseline", "--allow-reviewed-decrease=review.json"], {
      measure: () => current,
      baselinePath: path,
      readEvidence: () => ({
        reviewed: true,
        reviewer: "TychoHenzen",
        issue: 515,
        decreases: [
          {
            package: "quality-guard",
            metric: "branches",
            from: 89.08,
            to: 89.03,
            reason: "Reviewed measurement change for the baseline owner PBI.",
          },
        ],
      }),
      stdout: { write: () => undefined },
      stderr: { write: () => undefined },
    });

    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(readFileSync(path, "utf8")).packages["quality-guard"].branches, 89.03);
  });
});

test("CLI write path preserves the file when measured metrics are malformed", () => {
  withTemporaryBaseline((path, before) => {
    const exitCode = main(["--write-baseline"], {
      measure: () => ({
        ...improvedCurrent,
        "quality-guard": { ...improvedCurrent["quality-guard"], functions: Number.NaN },
      }),
      baselinePath: path,
      stderr: { write: () => undefined },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(readFileSync(path), before);
  });
});

test("rejects missing, non-finite, and extra metric values", () => {
  const missingMetric = { ...improvedCurrent["quality-guard"] };
  delete missingMetric.lines;
  assert.throws(
    () => mergeBaseline({ ...improvedCurrent, "quality-guard": missingMetric }, baseline),
    INVALID_METRICS_ERROR,
  );

  for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, "95.52"]) {
    assert.throws(
      () =>
        mergeBaseline(
          { ...improvedCurrent, "quality-guard": { ...improvedCurrent["quality-guard"], statements: value } },
          baseline,
        ),
      FINITE_METRIC_ERROR,
    );
  }

  assert.throws(
    () =>
      mergeBaseline(
        { ...improvedCurrent, "quality-guard": { ...improvedCurrent["quality-guard"], extra: 1 } },
        baseline,
      ),
    INVALID_METRICS_ERROR,
  );

  assert.throws(
    () =>
      mergeBaseline(improvedCurrent, {
        ...baseline,
        "quality-guard": { ...baseline["quality-guard"], branches: Number.POSITIVE_INFINITY },
      }),
    FINITE_METRIC_ERROR,
  );
});

test("adopts a genuinely new package", () => {
  const newPackage = { statements: 91, branches: 82, functions: 93, lines: 91 };
  const result = mergeBaseline({ ...improvedCurrent, "new-package": newPackage }, baseline);

  assert.deepEqual(result.packages["new-package"], newPackage);
});

test("requires the reviewed evidence path to be an explicit write option", () => {
  assert.deepEqual(parseArgs(["--write-baseline"]), {
    writeBaseline: true,
    reviewedDecreasePath: undefined,
  });
  assert.deepEqual(parseArgs(["--write-baseline", "--allow-reviewed-decrease=.github/quality/review.json"]), {
    writeBaseline: true,
    reviewedDecreasePath: ".github/quality/review.json",
  });
  assert.match(parseArgs(["--allow-reviewed-decrease=.github/quality/review.json"]).error, MISSING_WRITE_FLAG_ERROR);
});

test("rejects an untracked reviewed-decrease evidence file", () => {
  const path = join(process.cwd(), "scripts", "ci", `.reviewed-decrease-${process.pid}.json`);
  writeFileSync(path, JSON.stringify({ reviewed: true }));
  try {
    assert.throws(() => readReviewedDecreaseEvidence(path), TRACKED_EVIDENCE_ERROR);
  } finally {
    rmSync(path, { force: true });
  }
});
