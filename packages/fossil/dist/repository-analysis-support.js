import { FossilAnalysisError } from "./analysis-error.js";
function gitFailure(message) {
    return new FossilAnalysisError({ code: "git_failure", message });
}
export function emptyHistoryOutput() {
    return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        statusRecordCount: 0,
    };
}
export function assertSuccessfulGitOutput(result) {
    if (result.exitCode === 0)
        return result;
    throw gitFailure("Git command failed during repository analysis.");
}
export async function successfulGit({ runGit, arguments_, repositoryPath, input, historyMode = false, }) {
    let result;
    try {
        result = await runGit({ arguments_, repositoryPath, input, historyMode });
    }
    catch (error) {
        if (error instanceof FossilAnalysisError)
            throw error;
        throw gitFailure("Git command could not be started or read.");
    }
    return assertSuccessfulGitOutput(result);
}
//# sourceMappingURL=repository-analysis-support.js.map