import { FossilAnalysisError } from "./analysis-error.js";
import * as history from "./repository-analysis-history-boundary.js";
import { assertSuccessfulGitOutput, emptyHistoryOutput, } from "./repository-analysis-support.js";
export * from "./repository-analysis-history-repository.js";
function isMissingSparseCheckoutKey(result) {
    return result.exitCode === 1 && result.stdout === "" && result.stderr === "";
}
function rethrowSparseCheckoutError(error) {
    if (error instanceof FossilAnalysisError)
        throw error;
    throw new FossilAnalysisError({
        code: "git_failure",
        message: "Git command could not be started or read.",
    });
}
export async function sparseCheckoutOutput(runGit, root) {
    try {
        const result = await runGit({
            arguments_: history.sparseCheckoutArguments(),
            repositoryPath: root,
        });
        if (isMissingSparseCheckoutKey(result))
            return emptyHistoryOutput();
        return assertSuccessfulGitOutput(result);
    }
    catch (error) {
        rethrowSparseCheckoutError(error);
    }
}
export function historyWarnings({ includedHistory, analysisTimestampMs, shallow, sparse, submodules, }) {
    const warnings = [
        ...history.emptyHistoryWarnings(includedHistory),
        ...history.futureCommitWarnings(includedHistory, analysisTimestampMs),
        ...history.shallowHistoryWarnings(shallow.stdout),
        ...history.sparseCheckoutWarnings(sparse.stdout),
    ];
    if (submodules.stdout.trim() !== "")
        warnings.push({
            code: "submodule_omitted",
            message: "Submodule contents are omitted from repository analysis.",
        });
    return warnings;
}
export function historyBursts(includedHistory, analysisTimestampMs, gapHours) {
    const gapMs = gapHours * 60 * 60 * 1_000;
    const temporal = history.splitTemporalClusters(includedHistory, gapMs);
    const closed = history.retainClosedTemporalClusters(temporal, analysisTimestampMs, gapMs);
    return history.assembleClosedBursts(includedHistory, history.retainQualifiedClosedClusters(closed));
}
//# sourceMappingURL=repository-analysis-history-steps.js.map