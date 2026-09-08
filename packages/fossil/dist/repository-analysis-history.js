import * as history from "./repository-analysis-history-boundary.js";
import { runGitCommand } from "./git-process-boundary.js";
import { successfulGit } from "./repository-analysis-support.js";
import { historyBursts, historyWarnings, resolveHistoryRepository, sparseCheckoutOutput, } from "./repository-analysis-history-steps.js";
function includedHistoryFor(repository, options) {
    const parsedHistory = history.parseNonMergeGitLog(repository.historyOutput.stdout);
    const minimumTimestamp = repository.analysisTimestampMs - options.days * 24 * 60 * 60 * 1_000;
    return history.filterHistoryByExtensions(parsedHistory.filter((commit) => commit.committerTimestampMs >= minimumTimestamp), new Set(history.normalizeExtensions(options.extensions)));
}
async function completenessEvidence(repository, runGit) {
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
async function historyEvidence(input) {
    const includedHistory = includedHistoryFor(input.repository, input.options);
    const completeness = await completenessEvidence(input.repository, input.runGit);
    const warnings = historyWarnings({
        includedHistory,
        analysisTimestampMs: input.repository.analysisTimestampMs,
        ...completeness,
    });
    const bursts = historyBursts(includedHistory, input.repository.analysisTimestampMs, input.options.gapHours);
    return { ...completeness, includedHistory, warnings, bursts };
}
export async function analyzeHistoryStage(repositoryPath, options, runGit = runGitCommand) {
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
//# sourceMappingURL=repository-analysis-history.js.map