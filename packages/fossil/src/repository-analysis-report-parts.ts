import * as history from "./repository-analysis-history-boundary.js";
import type { AnalysisWarning, FossilReport } from "./types.js";
import type { analyzeHistoryStage } from "./repository-analysis-history.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";

const MEBIBYTE = 1_024 * 1_024;

export function reportBoundary(
  repositoryRoot: string,
  canonicalRepositoryRoot: string,
): FossilReport["boundary"] {
  return {
    repositoryRoot,
    canonicalRepositoryRoot,
    unobservedMechanisms: [
      "dynamic runtime loading",
      "reflection",
      "external consumers",
      "generated configuration",
    ],
  };
}

export function reportLimits(): FossilReport["limits"] {
  return {
    maximumCommits: 100_000,
    maximumFileStatusRecords: 1_000_000,
    maximumInventoriedFiles: 100_000,
    maximumGitStdoutBytes: 256 * MEBIBYTE,
    maximumGitStderrBytes: MEBIBYTE,
    maximumReferenceFileBytes: MEBIBYTE,
    maximumReferenceTotalBytes: 256 * MEBIBYTE,
  };
}

export function reportUsage(
  historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>,
  workspaceStage: Awaited<ReturnType<typeof analyzeWorkspaceStage>>,
): FossilReport["usage"] {
  const gitOutputs = [...historyStage.gitOutputs, ...workspaceStage.gitOutputs];
  return {
    commitRecords: historyStage.includedHistory.length,
    fileStatusRecords: historyStage.historyOutput.statusRecordCount,
    inventoriedFiles: workspaceStage.inventory.length,
    gitStdoutBytes: gitOutputs.reduce(
      (total, output) => total + output.stdoutBytes,
      0,
    ),
    gitStderrBytes: gitOutputs.reduce(
      (total, output) => total + output.stderrBytes,
      0,
    ),
    referenceBytes: workspaceStage.references.acceptedBytes,
    omittedReferencePaths:
      workspaceStage.references.graph.unavailablePaths.length,
  };
}

export function reportCompleteness(
  warnings: readonly AnalysisWarning[],
  referenceComplete: boolean,
): FossilReport["completeness"] {
  return {
    historyComplete: !warnings.some((warning) =>
      ["empty_repository", "future_commit", "shallow_history"].includes(
        warning.code,
      ),
    ),
    referenceAnalysisComplete:
      referenceComplete &&
      !warnings.some((warning) => warning.code === "sparse_checkout"),
    workspaceDebrisComplete: !warnings.some(
      (warning) => warning.code === "sparse_checkout",
    ),
  };
}

export function reportStatistics(
  historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>,
  reports: readonly FossilReport["bursts"][number][],
  workspaceDebris: FossilReport["workspaceDebris"],
): FossilReport["statistics"] {
  return {
    includedCommitCount: historyStage.includedHistory.length,
    logicalFileCount: history.resolveRenameActivities(
      historyStage.includedHistory,
    ).length,
    burstCount: reports.length,
    candidateFindingCount: 0,
    uniqueCandidatePathCount: 0,
    workspaceDebrisCount: workspaceDebris.length,
  };
}
