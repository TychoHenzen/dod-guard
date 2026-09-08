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

function includedHistoryFor(
  repository: Awaited<ReturnType<typeof resolveHistoryRepository>>,
  options: NormalizedAnalysisOptions,
) {
  const parsedHistory = history.parseNonMergeGitLog(
    repository.historyOutput.stdout,
  );
  const minimumTimestamp =
    repository.analysisTimestampMs - options.days * 24 * 60 * 60 * 1_000;
  return history.filterHistoryByExtensions(
    parsedHistory.filter(
      (commit) => commit.committerTimestampMs >= minimumTimestamp,
    ),
    new Set(history.normalizeExtensions(options.extensions)),
  );
}

async function completenessEvidence(
  repository: Awaited<ReturnType<typeof resolveHistoryRepository>>,
  runGit: typeof runGitCommand,
) {
  const shallow = await successfulGit({
    runGit,
    arguments_: history.shallowRepositoryArguments(),
    repositoryPath: repository.root,
  });
  const sparse = await sparseCheckoutOutput(runGit, repository.root);
  const submodules = await successfulGit({
    runGit,
    arguments_: ["submodule", "status", "--recursive"],
    repositoryPath: repository.root,
  });
  return { shallow, sparse, submodules };
}

async function historyEvidence(input: {
  repository: Awaited<ReturnType<typeof resolveHistoryRepository>>;
  options: NormalizedAnalysisOptions;
  runGit: typeof runGitCommand;
}) {
  const includedHistory = includedHistoryFor(input.repository, input.options);
  const completeness = await completenessEvidence(
    input.repository,
    input.runGit,
  );
  const warnings = historyWarnings({
    includedHistory,
    analysisTimestampMs: input.repository.analysisTimestampMs,
    ...completeness,
  });
  const bursts = historyBursts(
    includedHistory,
    input.repository.analysisTimestampMs,
    input.options.gapHours,
  );
  return { ...completeness, includedHistory, warnings, bursts };
}

export async function analyzeHistoryStage(
  repositoryPath: string,
  options: NormalizedAnalysisOptions,
  runGit: typeof runGitCommand = runGitCommand,
) {
  const repository = await resolveHistoryRepository(repositoryPath, runGit);
  const evidence = await historyEvidence({ repository, options, runGit });
  return {
    repositoryPath,
    ...repository,
    ...evidence,
    gitOutputs: [
      repository.version,
      repository.discovery,
      repository.prefix,
      repository.head,
      repository.historyOutput,
      evidence.shallow,
      evidence.sparse,
      evidence.submodules,
    ],
  };
}
