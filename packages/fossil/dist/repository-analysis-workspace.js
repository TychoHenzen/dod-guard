import { lstatSync } from "node:fs";
import { join } from "node:path";
import { FossilAnalysisError } from "./analysis-error.js";
import { successfulGit } from "./repository-analysis-support.js";
import { referenceSources } from "./repository-analysis-references.js";
import { CHECK_IGNORE_ARGUMENTS, filterWorkspaceDiscoveryPaths, IGNORED_DISCOVERY_ARGUMENTS, inspectWorkspaceFileMetadataWithWarnings, oldIgnoredWorkspaceCandidates, oldUntrackedWorkspaceCandidates, parseNulDelimitedPaths, parseVerboseCheckIgnore, UNTRACKED_DISCOVERY_ARGUMENTS, } from "./workspace-debris-boundary.js";
export async function analyzeWorkspaceStage(root, options, runGit, analysisTimestampMs) {
    const trackedOutput = await successfulGit(runGit, ["ls-files", "-z"], root);
    const untrackedOutput = await successfulGit(runGit, UNTRACKED_DISCOVERY_ARGUMENTS, root);
    const ignoredOutput = await successfulGit(runGit, IGNORED_DISCOVERY_ARGUMENTS, root);
    const untracked = parseNulDelimitedPaths(untrackedOutput.stdout);
    const ignored = parseNulDelimitedPaths(ignoredOutput.stdout);
    const inspect = (path) => {
        const metadata = lstatSync(join(root, path));
        return {
            path,
            isRegularFile: metadata.isFile(),
            isSymbolicLink: metadata.isSymbolicLink(),
            modifiedTimestampMs: metadata.mtimeMs,
        };
    };
    const untrackedMetadata = inspectWorkspaceFileMetadataWithWarnings(untracked, inspect, options.exclude);
    const ignoredMetadata = inspectWorkspaceFileMetadataWithWarnings(ignored, inspect, options.exclude);
    const filteredIgnored = filterWorkspaceDiscoveryPaths(ignored, options.exclude);
    const ignoreOutput = filteredIgnored.length === 0
        ? undefined
        : await successfulGit(runGit, CHECK_IGNORE_ARGUMENTS, root, `${filteredIgnored.join("\0")}\0`);
    const ignoredProvenance = parseVerboseCheckIgnore(ignoreOutput?.stdout ?? "");
    const workspaceCandidates = [
        ...oldUntrackedWorkspaceCandidates(untrackedMetadata.metadata, analysisTimestampMs, options.untrackedAgeDays),
        ...oldIgnoredWorkspaceCandidates(ignoredMetadata.metadata, ignoredProvenance, analysisTimestampMs, options.untrackedAgeDays),
    ];
    const inventory = [
        ...new Set([...parseNulDelimitedPaths(trackedOutput.stdout), ...workspaceCandidates.map(({ path }) => path)]),
    ].sort();
    if (inventory.length > 100_000)
        throw new FossilAnalysisError({ code: "resource_limit", message: "File inventory limit exceeded." });
    const references = referenceSources(root, inventory);
    return {
        references,
        workspaceCandidates,
        inventory,
        warnings: [...untrackedMetadata.warnings, ...ignoredMetadata.warnings, ...references.warnings],
        gitOutputs: [trackedOutput, untrackedOutput, ignoredOutput, ignoreOutput].filter((output) => output !== undefined),
    };
}
//# sourceMappingURL=repository-analysis-workspace.js.map