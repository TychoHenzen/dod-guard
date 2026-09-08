import { FossilAnalysisError } from "./analysis-error.js";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import * as history from "./git-analyzer.js";
import { assertSupportedGitVersion, runGitCommand } from "./git-process-boundary.js";
import { emptyHistoryOutput, successfulGit } from "./repository-analysis-support.js";
export async function analyzeHistoryStage(repositoryPath, options, runGit = runGitCommand) {
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
    const historyOutput = head.exitCode === 0
        ? await successfulGit(runGit, history.nonMergeGitLogArguments(), root, undefined, true)
        : emptyHistoryOutput();
    const parsedHistory = history.parseNonMergeGitLog(historyOutput.stdout);
    const minimumTimestamp = analysisTimestampMs - options.days * 24 * 60 * 60 * 1_000;
    const includedHistory = history.filterHistoryByExtensions(parsedHistory.filter((commit) => commit.committerTimestampMs >= minimumTimestamp), new Set(history.normalizeExtensions(options.extensions)));
    const shallow = await successfulGit(runGit, history.shallowRepositoryArguments(), root);
    const sparse = await successfulGit(runGit, history.sparseCheckoutArguments(), root).catch((error) => {
        if (error instanceof FossilAnalysisError)
            return { stdout: "", stdoutBytes: 0, stderrBytes: 0 };
        throw error;
    });
    const submodules = await successfulGit(runGit, ["submodule", "status", "--recursive"], root);
    const warnings = [
        ...history.emptyHistoryWarnings(includedHistory),
        ...history.futureCommitWarnings(includedHistory, analysisTimestampMs),
        ...history.shallowHistoryWarnings(shallow.stdout),
        ...history.sparseCheckoutWarnings(sparse.stdout),
        ...(submodules.stdout.trim() === ""
            ? []
            : [{ code: "submodule_omitted", message: "Submodule contents are omitted from repository analysis." }]),
    ];
    const bursts = history.assembleClosedBursts(includedHistory, history.retainQualifiedClosedClusters(history.retainClosedTemporalClusters(history.splitTemporalClusters(includedHistory, options.gapHours * 60 * 60 * 1_000), analysisTimestampMs, options.gapHours * 60 * 60 * 1_000)));
    return {
        repositoryPath,
        version,
        discovery,
        prefix,
        head,
        historyOutput,
        shallow,
        sparse,
        submodules,
        includedHistory,
        analysisTimestampMs,
        root,
        warnings,
        bursts,
        gitOutputs: [version, discovery, prefix, head, historyOutput, shallow, sparse, submodules],
    };
}
//# sourceMappingURL=repository-analysis-history.js.map