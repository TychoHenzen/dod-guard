import type { BurstReport } from "./types.js";
import type { BurstTableMode } from "./fossil-output-types/burst-table-mode.js";
import type { BurstTableRow } from "./fossil-output-types/burst-table-row.js";
import { comparePaths, normalizedPath } from "./fossil-output-text.js";

type NormalizedFinding = BurstReport["findings"][number] & {
  normalizedPath: string;
};

function normalizeFinding(
  finding: BurstReport["findings"][number],
): NormalizedFinding {
  return { ...finding, normalizedPath: normalizedPath(finding.path) };
}

function findingRow(finding: NormalizedFinding): BurstTableRow {
  return {
    kind: "finding",
    path: finding.normalizedPath,
    score: finding.score,
    scoreBasis: finding.scoreBasis,
  };
}

function findingExplanationRow(
  finding: NormalizedFinding,
): Extract<BurstTableRow, { kind: "finding-explanation" }> {
  return {
    kind: "finding-explanation",
    createdInBurst: finding.activity.createdInBurst,
    burstCommits: finding.activity.burstCommits,
    postBurstCommits: finding.activity.postBurstCommits,
    referenceAvailability: finding.referenceAvailability,
    strongInboundReferences: finding.strongInboundReferences,
    candidateNeighbors: finding.candidateNeighbors
      .map(normalizedPath)
      .sort(comparePaths),
    liveNeighbors: finding.liveNeighbors.map(normalizedPath).sort(comparePaths),
  };
}

function findingTableRows(
  burst: BurstReport,
  mode: BurstTableMode,
): BurstTableRow[] {
  const findings = burst.findings
    .map(normalizeFinding)
    .sort(
      (left, right) =>
        right.score - left.score ||
        comparePaths(left.normalizedPath, right.normalizedPath),
    );
  return findings.flatMap((finding) => {
    const row = findingRow(finding);
    if (mode === "normal") return [row];
    return [row, findingExplanationRow(finding)];
  });
}

export { findingTableRows };
