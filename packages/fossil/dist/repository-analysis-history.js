import * as history from "./git-analyzer.js";
import { runGitCommand } from "./git-process-boundary.js";
import { successfulGit } from "./repository-analysis-support.js";
import { historyBursts, historyWarnings, resolveHistoryRepository, sparseCheckoutOutput, } from "./repository-analysis-history-steps.js";
async function historyEvidence({ repository, options, runGit }) {
    const parsedHistory = history.parseNonMergeGitLog(repository.historyOutput.stdout);
    const minimumTimestamp = repository.analysisTimestampMs - options.days * 24 * 60 * 60 * 1_000;
    const includedHistory = history.filterHistoryByExtensions(parsedHistory.filter((commit) => commit.committerTimestampMs >= minimumTimestamp), new Set(history.normalizeExtensions(options.extensions)));
    const shallow = await successfulGit({ runGit, arguments_: history.shallowRepositoryArguments(), repositoryPath: repository.root });
    const sparse = await sparseCheckoutOutput(runGit, repository.root);
    const submodules = await successfulGit({
        runGit,
        arguments_: ["submodule", "status", "--recursive"],
        repositoryPath: repository.root,
    });
    const warnings = historyWarnings({
        includedHistory,
        analysisTimestampMs: repository.analysisTimestampMs,
        shallow,
        sparse,
        submodules,
    });
    const bursts = historyBursts(includedHistory, repository.analysisTimestampMs, options.gapHours);
    return { shallow, sparse, submodules, includedHistory, warnings, bursts };
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