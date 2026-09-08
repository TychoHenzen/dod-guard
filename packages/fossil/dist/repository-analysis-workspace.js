import { referenceSources } from "./repository-analysis-references.js";
import { buildWorkspaceCandidates, buildWorkspaceInventory, assertWorkspaceInventoryLimit, inspectWorkspacePaths, discoverWorkspace, readIgnoredProvenance, } from "./repository-analysis-workspace-steps.js";
export async function analyzeWorkspaceStage(root, options, runGit, analysisTimestampMs) {
    const discovery = await discoverWorkspace(root, runGit);
    const untrackedMetadata = inspectWorkspacePaths(root, discovery.untracked, options.exclude);
    const ignoredMetadata = inspectWorkspacePaths(root, discovery.ignored, options.exclude);
    const provenance = await readIgnoredProvenance(root, discovery.ignored, options.exclude, runGit);
    const workspaceCandidates = buildWorkspaceCandidates({
        untrackedMetadata,
        ignoredMetadata,
        ignoredProvenance: provenance.ignoredProvenance,
        analysisTimestampMs,
        minimumAgeDays: options.untrackedAgeDays,
    });
    const inventory = buildWorkspaceInventory({ trackedOutput: discovery.trackedOutput.stdout, workspaceCandidates });
    assertWorkspaceInventoryLimit(inventory);
    const references = referenceSources(root, inventory);
    return {
        references,
        workspaceCandidates,
        inventory,
        warnings: [...untrackedMetadata.warnings, ...ignoredMetadata.warnings, ...references.warnings],
        gitOutputs: [discovery.trackedOutput, discovery.untrackedOutput, discovery.ignoredOutput, provenance.ignoreOutput].filter((output) => output !== undefined),
    };
}
//# sourceMappingURL=repository-analysis-workspace.js.map