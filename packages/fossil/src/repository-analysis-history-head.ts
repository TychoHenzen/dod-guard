import { FossilAnalysisError } from "./analysis-error.js";
import * as history from "./repository-analysis-history-boundary.js";
import { runGitCommand } from "./git-process-boundary.js";
import {
  emptyHistoryOutput,
  successfulGit,
} from "./repository-analysis-support.js";

function gitFailure(message: string): FossilAnalysisError {
  return new FossilAnalysisError({ code: "git_failure", message });
}

async function emptyHistoryForUnbornHead(
  runGit: typeof runGitCommand,
  root: string,
) {
  let headReference;
  try {
    headReference = await runGit({
      arguments_: ["symbolic-ref", "--quiet", "HEAD"],
      repositoryPath: root,
    });
  } catch (error) {
    if (error instanceof FossilAnalysisError) throw error;
    throw gitFailure("Git command could not be started or read.");
  }
  if (
    headReference.exitCode !== 0 ||
    !/^refs\/heads\/.+$/.test(headReference.stdout.trim())
  )
    throw gitFailure("Git HEAD could not be verified.");
  await successfulGit({
    runGit,
    arguments_: ["status", "--porcelain=v1", "--untracked-files=no"],
    repositoryPath: root,
  });
  return emptyHistoryOutput();
}

export async function historyOutputForHead(
  exitCode: number | null,
  runGit: typeof runGitCommand,
  root: string,
) {
  if (exitCode !== 0) return emptyHistoryForUnbornHead(runGit, root);
  return successfulGit({
    runGit,
    arguments_: history.nonMergeGitLogArguments(),
    repositoryPath: root,
    historyMode: true,
  });
}
