import { lstatSync } from "node:fs";
import { join } from "node:path";
import { FossilAnalysisError } from "./analysis-error.js";
import { successfulGit } from "./repository-analysis-support.js";
import { CHECK_IGNORE_ARGUMENTS, filterWorkspaceDiscoveryPaths, IGNORED_DISCOVERY_ARGUMENTS, inspectWorkspaceFileMetadataWithWarnings, oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, parseNulDelimitedPaths, parseVerboseCheckIgnore, UNTRACKED_DISCOVERY_ARGUMENTS, } from "./workspace-debris-boundary.js";
export async function discoverWorkspace(root, runGit) {
    const trackedOutput = await successfulGit(runGit, ["ls-files", "-z"], root);
    const untrackedOutput = await successfulGit(runGit, UNTRACKED_DISCOVERY_ARGUMENTS, root);
    const ignoredOutput = await successfulGit(runGit, IGNORED_DISCOVERY_ARGUMENTS, root);
    return {
        trackedOutput,
        untrackedOutput,
        ignoredOutput,
        untracked: parseNulDelimitedPaths(untrackedOutput.stdout),
        ignored: parseNulDelimitedPaths(ignoredOutput.stdout),
    };
}
export function inspectWorkspacePaths(root, paths, exclude) {
    const inspect = (path) => {
        const metadata = lstatSync(join(root, path));
        return {
            path,
            isRegularFile: metadata.isFile(),
            isSymbolicLink: metadata.isSymbolicLink(),
            modifiedTimestampMs: metadata.mtimeMs,
        };
    };
    return inspectWorkspaceFileMetadataWithWarnings(paths, inspect, exclude);
}
export async function readIgnoredProvenance(root, ignored, exclude, runGit) {
    const filteredIgnored = filterWorkspaceDiscoveryPaths(ignored, exclude);
    if (filteredIgnored.length === 0)
        return { ignoreOutput: undefined, ignoredProvenance: parseVerboseCheckIgnore("") };
    const ignoreOutput = await successfulGit(runGit, CHECK_IGNORE_ARGUMENTS, root, `${filteredIgnored.join("\0")}\0`);
    return { ignoreOutput, ignoredProvenance: parseVerboseCheckIgnore(ignoreOutput.stdout) };
}
export function buildWorkspaceCandidates(input) {
    return [
        ...oldUntrackedWorkspaceCandidates(input.untrackedMetadata.metadata, input.analysisTimestampMs, input.minimumAgeDays),
        ...oldIgnoredWorkspaceCandidates(input.ignoredMetadata.metadata, input.ignoredProvenance, input.analysisTimestampMs, input.minimumAgeDays),
    ];
}
export function buildWorkspaceInventory(input) {
    return [
        ...new Set([
            ...parseNulDelimitedPaths(input.trackedOutput),
            ...input.workspaceCandidates.map(({ path }) => path),
        ]),
    ].sort();
}
export function assertWorkspaceInventoryLimit(inventory) {
    if (inventory.length > 100_000)
        throw new FossilAnalysisError({ code: "resource_limit", message: "File inventory limit exceeded." });
}
//# sourceMappingURL=repository-analysis-workspace-steps.js.map