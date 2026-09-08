import * as history from "./git-analyzer.js";
import { runGitCommand } from "./git-process-boundary.js";
import type { NormalizedAnalysisOptions } from "./types.js";
import { successfulGit } from "./repository-analysis-support.js";
import {
  historyBursts,
  historyWarnings,
  resolveHistoryRepository,
  sparseCheckoutOutput,
} from "./repository-analysis-history-steps.js";

export async function analyzeHistoryStage(
  repositoryPath: string,
  options: NormalizedAnalysisOptions,
  runGit: typeof runGitCommand = runGitCommand,
) {
  const repository = await resolveHistoryRepository(repositoryPath, runGit);
  const parsedHistory = history.parseNonMergeGitLog(repository.historyOutput.stdout);
  const minimumTimestamp = repository.analysisTimestampMs - options.days * 24 * 60 * 60 * 1_000;
  const includedHistory = history.filterHistoryByExtensions(
    parsedHistory.filter((commit) => commit.committerTimestampMs >= minimumTimestamp),
    new Set(history.normalizeExtensions(options.extensions)),
  );
  const shallow = await successfulGit(runGit, history.shallowRepositoryArguments(), repository.root);
  const sparse = await sparseCheckoutOutput(runGit, repository.root);
  const submodules = await successfulGit(runGit, ["submodule", "status", "--recursive"], repository.root);
  const warnings = historyWarnings(includedHistory, repository.analysisTimestampMs, shallow, sparse, submodules);
  const bursts = historyBursts(includedHistory, repository.analysisTimestampMs, options.gapHours);
  return {
    repositoryPath,
    ...repository,
    shallow,
    sparse,
    submodules,
    includedHistory,
    warnings,
    bursts,
    gitOutputs: [repository.version, repository.discovery, repository.prefix, repository.head, repository.historyOutput, shallow, sparse, submodules],
  };
}
