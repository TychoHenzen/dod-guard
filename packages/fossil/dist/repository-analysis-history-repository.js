import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { FossilAnalysisError } from "./analysis-error.js";
import { assertSupportedGitVersion, } from "./git-process-boundary.js";
import { historyOutputForHead } from "./repository-analysis-history-head.js";
import { successfulGit } from "./repository-analysis-support.js";
function repositoryRoot(repositoryPath, prefix) {
    return resolve(realpathSync(repositoryPath), ...prefix
        .trim()
        .split("/")
        .filter(Boolean)
        .map(() => ".."));
}
async function repositoryDiscovery(repositoryPath, runGit) {
    const discovery = await runGit({
        arguments_: ["rev-parse", "--show-toplevel"],
        repositoryPath,
    });
    if (discovery.exitCode !== 0)
        throw new FossilAnalysisError({
            code: "not_repository",
            message: "Not a Git repository.",
        });
    return discovery;
}
export async function resolveHistoryRepository(repositoryPath, runGit) {
    const version = await successfulGit({ runGit, arguments_: ["--version"] });
    assertSupportedGitVersion(version.stdout);
    const discovery = await repositoryDiscovery(repositoryPath, runGit);
    const prefix = await successfulGit({
        runGit,
        arguments_: ["rev-parse", "--show-prefix"],
        repositoryPath,
    });
    const root = repositoryRoot(repositoryPath, prefix.stdout);
    const analysisTimestampMs = Date.now();
    const head = await runGit({
        arguments_: ["rev-parse", "--verify", "HEAD"],
        repositoryPath: root,
    });
    const historyOutput = await historyOutputForHead(head.exitCode, runGit, root);
    return {
        version,
        discovery,
        prefix,
        head,
        historyOutput,
        analysisTimestampMs,
        root,
    };
}
//# sourceMappingURL=repository-analysis-history-repository.js.map