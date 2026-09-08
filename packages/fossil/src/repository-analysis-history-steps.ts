import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { FossilAnalysisError } from "./analysis-error.js";
import * as history from "./git-analyzer.js";
import { assertSupportedGitVersion, runGitCommand } from "./git-process-boundary.js";
import { emptyHistoryOutput, successfulGit } from "./repository-analysis-support.js";

export async function resolveHistoryRepository(
  repositoryPath: string,
  runGit: typeof runGitCommand,
) {
  const version = await successfulGit({ runGit, arguments_: ["--version"] });
  assertSupportedGitVersion(version.stdout);
  const discovery = await runGit({ arguments_: ["rev-parse", "--show-toplevel"], repositoryPath });
  if (discovery.exitCode !== 0)
    throw new FossilAnalysisError({ code: "not_repository", message: "Not a Git repository." });
  const prefix = await successfulGit({ runGit, arguments_: ["rev-parse", "--show-prefix"], repositoryPath });
  const root = resolve(
    realpathSync(repositoryPath),
    ...prefix.stdout
      .trim()
      .split("/")
      .filter(Boolean)
      .map(() => ".."),
  );
  const analysisTimestampMs = Date.now();
  const head = await runGit({ arguments_: ["rev-parse", "--verify", "HEAD"], repositoryPath: root });
  const historyOutput = await historyOutputForHead(head.exitCode, runGit, root);
  return { version, discovery, prefix, head, historyOutput, analysisTimestampMs, root };
}

async function historyOutputForHead(exitCode: number | null, runGit: typeof runGitCommand, root: string) {
  if (exitCode !== 0) return emptyHistoryOutput();
  return successfulGit({ runGit, arguments_: history.nonMergeGitLogArguments(), repositoryPath: root, historyMode: true });
}

export async function sparseCheckoutOutput(runGit: typeof runGitCommand, root: string) {
  try {
    return await successfulGit({ runGit, arguments_: history.sparseCheckoutArguments(), repositoryPath: root });
  } catch (error) {
    if (error instanceof FossilAnalysisError) return emptyHistoryOutput();
    throw error;
  }
}

export function historyWarnings({ includedHistory, analysisTimestampMs, shallow, sparse, submodules }: {
  includedHistory: ReturnType<typeof history.filterHistoryByExtensions>;
  analysisTimestampMs: number;
  shallow: Awaited<ReturnType<typeof successfulGit>>;
  sparse: Awaited<ReturnType<typeof successfulGit>>;
  submodules: Awaited<ReturnType<typeof successfulGit>>;
}) {
  const warnings = [
    ...history.emptyHistoryWarnings(includedHistory),
    ...history.futureCommitWarnings(includedHistory, analysisTimestampMs),
    ...history.shallowHistoryWarnings(shallow.stdout),
    ...history.sparseCheckoutWarnings(sparse.stdout),
  ];
  if (submodules.stdout.trim() !== "")
    warnings.push({ code: "submodule_omitted" as const, message: "Submodule contents are omitted from repository analysis." });
  return warnings;
}

export function historyBursts(
  includedHistory: ReturnType<typeof history.filterHistoryByExtensions>,
  analysisTimestampMs: number,
  gapHours: number,
) {
  const gapMs = gapHours * 60 * 60 * 1_000;
  const temporal = history.splitTemporalClusters(includedHistory, gapMs);
  const closed = history.retainClosedTemporalClusters(temporal, analysisTimestampMs, gapMs);
  return history.assembleClosedBursts(includedHistory, history.retainQualifiedClosedClusters(closed));
}
