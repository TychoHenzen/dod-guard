import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdvisoryFossilFinding } from "./fossil-grader.js";
import { renderFossilReportJson } from "./output.js";
import type { BurstReport, FossilFinding } from "./types.js";
import {
  advisoryFindingInput,
  createReport,
  optionsFor,
} from "./testing/report-fixtures.js";
import { limitsWith } from "./testing/report-limits.js";

test(
  "serializes one complete schema-versioned JSON " +
    "report without table prose",
  () => {
    const report = createReport(optionsFor("json"), {
      analysisTimestampMs: 1_735_689_600_000,
      limits: limitsWith(10),
    });

    const output = renderFossilReportJson(report);

    assert.deepEqual(JSON.parse(output), report);
    assert.equal(JSON.parse(output).schemaVersion, 1);
    assert.equal(output.includes("\u001b["), false);
    assert.equal(output.includes("Burst "), false);
    assert.equal(output.includes("survivor "), false);
  },
);
test(
  "derives burst-path and unique normalized candidate " + "totals in JSON",
  () => {
    const candidate = (path: string, burstId: string): FossilFinding =>
      createAdvisoryFossilFinding(
        advisoryFindingInput({ burstId, path, score: 0.8, burstCommits: 1 }),
      );
    const bursts: readonly BurstReport[] = [
      {
        id: "first",
        startTimestampMs: 0,
        endTimestampMs: 1,
        commitCount: 1,
        fileCount: 1,
        survivors: [],
        findings: [candidate("src\\shared.ts", "first")],
        deletedPaths: [],
      },
      {
        id: "second",
        startTimestampMs: 2,
        endTimestampMs: 3,
        commitCount: 2,
        fileCount: 2,
        survivors: [],
        findings: [
          candidate("src/shared.ts", "second"),
          candidate("src/other.ts", "second"),
        ],
        deletedPaths: [],
      },
    ];
    const report = createReport(optionsFor("json"), {
      statistics: {
        includedCommitCount: 2,
        logicalFileCount: 2,
        burstCount: 2,
        candidateFindingCount: 99,
        uniqueCandidatePathCount: 99,
        workspaceDebrisCount: 0,
      },
      bursts,
    });
    const before = structuredClone(report);

    const parsed = JSON.parse(renderFossilReportJson(report));

    assert.deepEqual(parsed.statistics, {
      ...report.statistics,
      candidateFindingCount: 3,
      uniqueCandidatePathCount: 2,
    });
    assert.deepEqual(report, before);
  },
);
