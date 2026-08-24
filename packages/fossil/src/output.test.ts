import assert from "node:assert/strict";
import { test } from "node:test";
import { burstTableRows, renderBurstTableRows, renderFossilReportJson, workspaceDebrisTableRows } from "./output.js";
import type { BurstReport, FossilReport, WorkspaceDebrisFinding } from "./types.js";

function finding(path: string, kind: "untracked" | "ignored"): WorkspaceDebrisFinding {
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path,
    kind,
    modifiedTimestampMs: 0,
    ageSource: "mtime",
    ageUncertainty: "mtime only",
    detectedReferenceEvidence: [],
    analysisBoundary: "C:/repo",
    unobservedReferenceMechanisms: [],
  };
}

// covers: fossil/workspace-debris :: Review-only reporting :: Large ignored tree is summarized
test("summarizes ignored trees of at least twenty findings only in normal table rows", () => {
  const findings = [
    ...Array.from({ length: 20 }, (_, index) => finding(`generated/file-${index}.tmp`, "ignored")),
    finding("logs/one.tmp", "ignored"),
    finding("scratch/old.ts", "untracked"),
  ];
  const before = structuredClone(findings);

  const normalRows = workspaceDebrisTableRows(findings, "normal");
  const verboseRows = workspaceDebrisTableRows(findings, "verbose");

  assert.deepEqual(normalRows, [
    { kind: "ignored-directory-summary", directory: "generated", count: 20 },
    { kind: "finding", finding: findings[20] },
    { kind: "finding", finding: findings[21] },
  ]);
  assert.equal(verboseRows.length, 22);
  assert.deepEqual(
    verboseRows.map((row) => row.kind),
    Array.from({ length: 22 }, () => "finding"),
  );
  assert.deepEqual(findings, before);
});

// covers: fossil/cli :: Table output :: Burst table keeps context together
test("renders burst context and normalized survivors before score-sorted candidates", () => {
  const burst: BurstReport = {
    id: "burst-1",
    startTimestampMs: Date.UTC(2025, 0, 2),
    endTimestampMs: Date.UTC(2025, 0, 5),
    commitCount: 8,
    fileCount: 4,
    survivors: [
      {
        identity: "z",
        path: "src\\zeta.ts",
        burstCommits: 1,
        postBurstCommits: 0,
        createdInBurst: true,
        existsAtHead: true,
      },
      {
        identity: "a",
        path: "./src/alpha.ts",
        burstCommits: 1,
        postBurstCommits: 0,
        createdInBurst: true,
        existsAtHead: true,
      },
    ],
    findings: [
      {
        classification: "advisory",
        burstId: "burst-1",
        path: "src/low.ts",
        activity: {
          identity: "low",
          path: "src/low.ts",
          burstCommits: 1,
          postBurstCommits: 0,
          createdInBurst: true,
          existsAtHead: true,
        },
        score: 0.4,
        scoreBasis: "git-only",
        subscores: { churn: 0.1, abandonment: 1 },
        referenceAvailability: "unavailable",
        strongInboundReferences: 0,
        candidateNeighbors: [],
        liveNeighbors: [],
      },
      {
        classification: "advisory",
        burstId: "burst-1",
        path: "src\\high.ts",
        activity: {
          identity: "high",
          path: "src/high.ts",
          burstCommits: 2,
          postBurstCommits: 0,
          createdInBurst: true,
          existsAtHead: true,
        },
        score: 0.8,
        scoreBasis: "full",
        subscores: { churn: 0.2, abandonment: 1, referenceWeakness: 1, clusterIsolation: 1 },
        referenceAvailability: "complete",
        strongInboundReferences: 0,
        candidateNeighbors: [],
        liveNeighbors: [],
      },
    ],
    deletedPaths: [],
  };

  const newerRows = burstTableRows([burst]);
  assert.deepEqual(newerRows, [
    { kind: "burst", id: "burst-1", startDate: "2025-01-02", endDate: "2025-01-05", commitCount: 8, fileCount: 4 },
    { kind: "survivor", path: "src/alpha.ts" },
    { kind: "survivor", path: "src/zeta.ts" },
    { kind: "finding", path: "src/high.ts", score: 0.8, scoreBasis: "full" },
    { kind: "finding", path: "src/low.ts", score: 0.4, scoreBasis: "git-only" },
  ]);

  const olderBurst: BurstReport = {
    ...burst,
    id: "burst-older",
    startTimestampMs: Date.UTC(2024, 11, 1),
    endTimestampMs: Date.UTC(2024, 11, 3),
    survivors: [burst.survivors[1]],
    findings: [{ ...burst.findings[0], burstId: "burst-older" }],
  };
  const olderRows = burstTableRows([olderBurst]);

  assert.deepEqual(burstTableRows([olderBurst, burst]), [...newerRows, ...olderRows]);
});

// covers: fossil/cli :: Table output :: Verbose table explains a candidate
test("adds exactly one verbose explanation immediately after each candidate", () => {
  const activity = (path: string, createdInBurst: boolean, burstCommits: number, postBurstCommits: number) => ({
    identity: path,
    path,
    createdInBurst,
    burstCommits,
    postBurstCommits,
    existsAtHead: true,
  });
  const burst: BurstReport = {
    id: "verbose-burst",
    startTimestampMs: Date.UTC(2025, 0, 1),
    endTimestampMs: Date.UTC(2025, 0, 2),
    commitCount: 2,
    fileCount: 2,
    survivors: [],
    findings: [
      {
        classification: "advisory",
        burstId: "verbose-burst",
        path: "src/unavailable.ts",
        activity: activity("src/unavailable.ts", true, 3, 0),
        score: 0.9,
        scoreBasis: "git-only",
        subscores: { churn: 1, abandonment: 1 },
        referenceAvailability: "unavailable",
        strongInboundReferences: 0,
        candidateNeighbors: [],
        liveNeighbors: [],
      },
      {
        classification: "advisory",
        burstId: "verbose-burst",
        path: "src/complete.ts",
        activity: activity("src/complete.ts", false, 2, 4),
        score: 0.8,
        scoreBasis: "full",
        subscores: { churn: 0.5, abandonment: 0, referenceWeakness: 0.5, clusterIsolation: 0.5 },
        referenceAvailability: "complete",
        strongInboundReferences: 1,
        candidateNeighbors: ["./src/candidate.ts"],
        liveNeighbors: ["src\\live.ts"],
      },
    ],
    deletedPaths: [],
  };

  assert.deepEqual(
    burstTableRows([burst], "normal").map((row) => row.kind),
    ["burst", "finding", "finding"],
  );
  assert.deepEqual(burstTableRows([burst], "verbose"), [
    {
      kind: "burst",
      id: "verbose-burst",
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      commitCount: 2,
      fileCount: 2,
    },
    { kind: "finding", path: "src/unavailable.ts", score: 0.9, scoreBasis: "git-only" },
    {
      kind: "finding-explanation",
      createdInBurst: true,
      burstCommits: 3,
      postBurstCommits: 0,
      referenceAvailability: "unavailable",
      strongInboundReferences: 0,
      candidateNeighbors: [],
      liveNeighbors: [],
    },
    { kind: "finding", path: "src/complete.ts", score: 0.8, scoreBasis: "full" },
    {
      kind: "finding-explanation",
      createdInBurst: false,
      burstCommits: 2,
      postBurstCommits: 4,
      referenceAvailability: "complete",
      strongInboundReferences: 1,
      candidateNeighbors: ["src/candidate.ts"],
      liveNeighbors: ["src/live.ts"],
    },
  ]);
});

// covers: fossil/cli :: Table output :: Redirected table contains no ANSI escapes
test("renders ANSI styling only when the caller marks table output as a TTY", () => {
  const rows = [
    {
      kind: "burst" as const,
      id: "burst-1",
      startDate: "2025-01-01",
      endDate: "2025-01-02",
      commitCount: 2,
      fileCount: 1,
    },
    { kind: "survivor" as const, path: "src/survivor.ts" },
    { kind: "finding" as const, path: "src/finding.ts", score: 0.8, scoreBasis: "full" as const },
    {
      kind: "finding-explanation" as const,
      createdInBurst: true,
      burstCommits: 2,
      postBurstCommits: 0,
      referenceAvailability: "complete" as const,
      strongInboundReferences: 1,
      candidateNeighbors: ["src/candidate.ts"],
      liveNeighbors: ["src/live.ts"],
    },
  ];

  const redirected = renderBurstTableRows(rows, { isTty: false });
  const tty = renderBurstTableRows(rows, { isTty: true });

  assert.equal(redirected.includes("\u001b["), false);
  assert.match(redirected, /Burst burst-1/);
  assert.match(redirected, /survivor src\/survivor.ts/);
  assert.match(redirected, /finding src\/finding.ts: score 0.8 \(full\)/);
  assert.match(redirected, /created in burst; 2 burst commits, 0 post-burst commits/);
  assert.equal(tty.startsWith("\u001b[1mBurst burst-1"), true);
});

// covers: fossil/cli :: Versioned JSON output :: JSON output is machine-readable
test("serializes one complete schema-versioned JSON report without table prose", () => {
  const report: FossilReport = {
    schemaVersion: 1,
    options: {
      days: 90,
      gapHours: 48,
      threshold: 0.4,
      format: "json",
      extensions: [],
      untrackedAgeDays: 90,
      exclude: [],
      verbose: false,
    },
    analysisTimestampMs: 1_735_689_600_000,
    gitVersion: "2.47.0",
    boundary: {
      repositoryRoot: "C:/repo",
      canonicalRepositoryRoot: "C:/repo",
      unobservedMechanisms: [],
    },
    limits: {
      maximumCommits: 10,
      maximumFileStatusRecords: 10,
      maximumInventoriedFiles: 10,
      maximumGitStdoutBytes: 10,
      maximumGitStderrBytes: 10,
      maximumReferenceFileBytes: 10,
      maximumReferenceTotalBytes: 10,
    },
    usage: {
      commitRecords: 0,
      fileStatusRecords: 0,
      inventoriedFiles: 0,
      gitStdoutBytes: 0,
      gitStderrBytes: 0,
      referenceBytes: 0,
      omittedReferencePaths: 0,
    },
    completeness: {
      historyComplete: true,
      referenceAnalysisComplete: true,
      workspaceDebrisComplete: true,
    },
    statistics: {
      includedCommitCount: 0,
      logicalFileCount: 0,
      burstCount: 0,
      candidateFindingCount: 0,
      uniqueCandidatePathCount: 0,
      workspaceDebrisCount: 0,
    },
    warnings: [],
    bursts: [],
    workspaceDebris: [],
  };

  const output = renderFossilReportJson(report);

  assert.deepEqual(JSON.parse(output), report);
  assert.equal(JSON.parse(output).schemaVersion, 1);
  assert.equal(output.includes("\u001b["), false);
  assert.equal(output.includes("Burst "), false);
  assert.equal(output.includes("survivor "), false);
});
