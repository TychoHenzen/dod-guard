import { workspaceDebrisFinding } from "./workspace-debris-boundary.js";
export function buildWorkspaceDebrisFindings(candidates, references, inventory, root) {
    return candidates.flatMap((candidate) => {
        const finding = workspaceDebrisFinding(candidate, references.sources, inventory, root, [
            "dynamic runtime loading",
            "reflection",
            "external consumers",
            "generated configuration",
        ]);
        return finding ? [finding] : [];
    });
}
//# sourceMappingURL=repository-analysis-workspace-findings.js.map