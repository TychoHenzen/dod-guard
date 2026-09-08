import * as history from "./git-analyzer.js";
import { finalizeFossilReport } from "./output.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";
import type { analyzeHistoryStage } from "./repository-analysis-history.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";

const MEBIBYTE = 1_024 * 1_024;

export function buildAnalysisReport(
  historyStage: Awaited<ReturnType<typeof analyzeHistoryStage>>,
  workspaceStage: Awaited<ReturnType<typeof analyzeWorkspaceStage>>,
  options: NormalizedAnalysisOptions,
  reports: readonly FossilReport["bursts"][number][],
  workspaceDebris: FossilReport["workspaceDebris"],
): FossilReport {
  const warnings = [...historyStage.warnings, ...workspaceStage.warnings];
  const gitOutputs = [...historyStage.gitOutputs, ...workspaceStage.gitOutputs];
  return finalizeFossilReport({
    schemaVersion: 1,
    options,
    analysisTimestampMs: historyStage.analysisTimestampMs,
    gitVersion: historyStage.version.stdout.trim(),
    boundary: {
      repositoryRoot: historyStage.repositoryPath,
      canonicalRepositoryRoot: historyStage.root,
      unobservedMechanisms: ["dynamic runtime loading", "reflection", "external consumers", "generated configuration"],
    },
    limits: {
      maximumCommits: 100_000,
      maximumFileStatusRecords: 1_000_000,
      maximumInventoriedFiles: 100_000,
      maximumGitStdoutBytes: 256 * MEBIBYTE,
      maximumGitStderrBytes: MEBIBYTE,
      maximumReferenceFileBytes: MEBIBYTE,
      maximumReferenceTotalBytes: 256 * MEBIBYTE,
    },
    usage: {
      commitRecords: historyStage.includedHistory.length,
      fileStatusRecords: historyStage.historyOutput.statusRecordCount,
      inventoriedFiles: workspaceStage.inventory.length,
      gitStdoutBytes: gitOutputs.reduce((total, output) => total + output.stdoutBytes, 0),
      gitStderrBytes: gitOutputs.reduce((total, output) => total + output.stderrBytes, 0),
      referenceBytes: workspaceStage.references.acceptedBytes,
      omittedReferencePaths: workspaceStage.references.graph.unavailablePaths.length,
    },
    completeness: {
      historyComplete: !warnings.some((warning) =>
        ["empty_repository", "future_commit", "shallow_history"].includes(warning.code),
      ),
      referenceAnalysisComplete:
        workspaceStage.references.graph.complete && !warnings.some((warning) => warning.code === "sparse_checkout"),
      workspaceDebrisComplete: !warnings.some((warning) => warning.code === "sparse_checkout"),
    },
    statistics: {
      includedCommitCount: historyStage.includedHistory.length,
      logicalFileCount: history.resolveRenameActivities(historyStage.includedHistory).length,
      burstCount: reports.length,
      candidateFindingCount: 0,
      uniqueCandidatePathCount: 0,
      workspaceDebrisCount: workspaceDebris.length,
    },
    warnings,
    bursts: reports,
    workspaceDebris,
  });
}
