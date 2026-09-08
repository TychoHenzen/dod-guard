import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { FossilAnalysisError } from "./analysis-error.js";
import * as history from "./git-analyzer.js";
import { assertSupportedGitVersion } from "./git-process-boundary.js";
import { emptyHistoryOutput, successfulGit } from "./repository-analysis-support.js";
export async function resolveHistoryRepository(repositoryPath, runGit) {
    const version = await successfulGit(runGit, ["--version"]);
    assertSupportedGitVersion(version.stdout);
    const discovery = await runGit(["rev-parse", "--show-toplevel"], repositoryPath);
    if (discovery.exitCode !== 0)
        throw new FossilAnalysisError({ code: "not_repository", message: "Not a Git repository." });
    const prefix = await successfulGit(runGit, ["rev-parse", "--show-prefix"], repositoryPath);
    const root = resolve(realpathSync(repositoryPath), ...prefix.stdout
        .trim()
        .split("/")
        .filter(Boolean)
        .map(() => ".."));
    const analysisTimestampMs = Date.now();
    const head = await runGit(["rev-parse", "--verify", "HEAD"], root);
    const historyOutput = await historyOutputForHead(head.exitCode, runGit, root);
    return { version, discovery, prefix, head, historyOutput, analysisTimestampMs, root };
}
async function historyOutputForHead(exitCode, runGit, root) {
    if (exitCode !== 0)
        return emptyHistoryOutput();
    return successfulGit(runGit, history.nonMergeGitLogArguments(), root, undefined, true);
}
export async function sparseCheckoutOutput(runGit, root) {
    try {
        return await successfulGit(runGit, history.sparseCheckoutArguments(), root);
    }
    catch (error) {
        if (error instanceof FossilAnalysisError)
            return emptyHistoryOutput();
        throw error;
    }
}
export function historyWarnings(includedHistory, analysisTimestampMs, shallow, sparse, submodules) {
    const warnings = [
        ...history.emptyHistoryWarnings(includedHistory),
        ...history.futureCommitWarnings(includedHistory, analysisTimestampMs),
        ...history.shallowHistoryWarnings(shallow.stdout),
        ...history.sparseCheckoutWarnings(sparse.stdout),
    ];
    if (submodules.stdout.trim() !== "")
        warnings.push({ code: "submodule_omitted", message: "Submodule contents are omitted from repository analysis." });
    return warnings;
}
export function historyBursts(includedHistory, analysisTimestampMs, gapHours) {
    const gapMs = gapHours * 60 * 60 * 1_000;
    const temporal = history.splitTemporalClusters(includedHistory, gapMs);
    const closed = history.retainClosedTemporalClusters(temporal, analysisTimestampMs, gapMs);
    return history.assembleClosedBursts(includedHistory, history.retainQualifiedClosedClusters(closed));
}
//# sourceMappingURL=repository-analysis-history-steps.js.map