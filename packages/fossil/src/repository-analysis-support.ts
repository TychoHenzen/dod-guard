import { FossilAnalysisError } from "./analysis-error.js";
import { type CollectedGitOutput, runGitCommand } from "./git-process-boundary.js";

function gitFailure(message: string): FossilAnalysisError {
  return new FossilAnalysisError({ code: "git_failure", message });
}

export function emptyHistoryOutput(): CollectedGitOutput {
  return { exitCode: 0, stdout: "", stderr: "", stdoutBytes: 0, stderrBytes: 0, statusRecordCount: 0 };
}

export async function successfulGit({ runGit, arguments_, repositoryPath, input, historyMode = false }: {
  runGit: typeof runGitCommand;
  arguments_: readonly string[];
  repositoryPath?: string;
  input?: string;
  historyMode?: boolean;
}) {
  let result: CollectedGitOutput;
  try {
    result = await runGit({ arguments_, repositoryPath, input, historyMode });
  } catch {
    throw gitFailure("Git command could not be started or read.");
  }
  if (result.exitCode === 0) return result;
  throw gitFailure("Git command failed during repository analysis.");
}
