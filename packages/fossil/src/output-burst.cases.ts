import assert from "node:assert/strict";
import { test } from "node:test";
import { burstTableRows } from "./output.js";
import { BURST_FIXTURE } from "./output-burst-fixture.js";

test(
  "renders burst context and normalized survivors before score-sorted " +
    "candidates",
  () => {
    const newerRows = burstTableRows([BURST_FIXTURE]);
    assert.deepEqual(newerRows, [
      {
        kind: "burst",
        id: "burst-1",
        startDate: "2025-01-02",
        endDate: "2025-01-05",
        commitCount: 8,
        fileCount: 4,
      },
      { kind: "survivor", path: "src/alpha.ts" },
      { kind: "survivor", path: "src/zeta.ts" },
      { kind: "finding", path: "src/high.ts", score: 0.8, scoreBasis: "full" },
      {
        kind: "finding",
        path: "src/low.ts",
        score: 0.4,
        scoreBasis: "git-only",
      },
    ]);

    const olderBurst = {
      ...BURST_FIXTURE,
      id: "burst-older",
      startTimestampMs: Date.UTC(2024, 11, 1),
      endTimestampMs: Date.UTC(2024, 11, 3),
      survivors: [BURST_FIXTURE.survivors[1]],
      findings: [{ ...BURST_FIXTURE.findings[0], burstId: "burst-older" }],
    };
    const olderRows = burstTableRows([olderBurst]);

    assert.deepEqual(burstTableRows([olderBurst, BURST_FIXTURE]), [
      ...newerRows,
      ...olderRows,
    ]);
  },
);
