import { hasInboundWorkspaceUsage } from "./workspace-usage.js";
/** Creates a separate advisory workspace-debris finding when no inbound usage evidence is discovered. */
export function workspaceDebrisFinding({ candidate, sources, inventoryPaths, analysisBoundary, unobservedMechanisms }) {
    if (hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths))
        return undefined;
    return {
        classification: "advisory",
        review: "possible workspace debris",
        path: candidate.path,
        kind: candidate.kind,
        modifiedTimestampMs: candidate.modifiedTimestampMs,
        ageSource: "mtime",
        ageUncertainty: "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
        ignore: "ignore" in candidate ? candidate.ignore : undefined,
        detectedReferenceEvidence: [],
        analysisBoundary,
        unobservedReferenceMechanisms: unobservedMechanisms,
    };
}
//# sourceMappingURL=workspace-finding.js.map