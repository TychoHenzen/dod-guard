import { FossilAnalysisError } from "./analysis-error.js";
import { parseNulDelimitedPaths } from "./workspace-debris-boundary.js";
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
        throw new FossilAnalysisError({
            code: "resource_limit",
            message: "File inventory limit exceeded.",
        });
}
//# sourceMappingURL=repository-analysis-workspace-inventory.js.map