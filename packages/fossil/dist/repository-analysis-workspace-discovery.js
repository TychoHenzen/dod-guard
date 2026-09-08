import { successfulGit } from "./repository-analysis-support.js";
import { IGNORED_DISCOVERY_ARGUMENTS, parseNulDelimitedPaths, UNTRACKED_DISCOVERY_ARGUMENTS, } from "./workspace-debris-boundary.js";
export async function discoverWorkspace(root, runGit) {
    const trackedOutput = await successfulGit({
        runGit,
        arguments_: ["ls-files", "-z"],
        repositoryPath: root,
    });
    const untrackedOutput = await successfulGit({
        runGit,
        arguments_: UNTRACKED_DISCOVERY_ARGUMENTS,
        repositoryPath: root,
    });
    const ignoredOutput = await successfulGit({
        runGit,
        arguments_: IGNORED_DISCOVERY_ARGUMENTS,
        repositoryPath: root,
    });
    return {
        trackedOutput,
        untrackedOutput,
        ignoredOutput,
        untracked: parseNulDelimitedPaths(untrackedOutput.stdout),
        ignored: parseNulDelimitedPaths(ignoredOutput.stdout),
    };
}
//# sourceMappingURL=repository-analysis-workspace-discovery.js.map