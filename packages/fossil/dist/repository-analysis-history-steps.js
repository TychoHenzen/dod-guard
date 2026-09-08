import { FossilAnalysisError } from "./analysis-error.js";
import * as history from "./git-analyzer.js";
import { emptyHistoryOutput, successfulGit, } from "./repository-analysis-support.js";
export { resolveHistoryRepository, } from "./repository-analysis-history-repository.js";
export async function sparseCheckoutOutput(runGit, root) {
    try {
        return await successfulGit({
            runGit,
            arguments_: history.sparseCheckoutArguments(),
            repositoryPath: root,
        });
    }
    catch (error) {
        if (error instanceof FossilAnalysisError)
            return emptyHistoryOutput();
        throw error;
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