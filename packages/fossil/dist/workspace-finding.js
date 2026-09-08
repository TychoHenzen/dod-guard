import { hasInboundWorkspaceUsage } from "./workspace-usage.js";
/** Creates an advisory finding when no inbound usage is discovered. */
export function workspaceDebrisFinding(input) {
    const { candidate, sources, inventoryPaths, analysisBoundary, unobservedMechanisms, } = input;
    if (hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths))
        return undefined;
    return {
        classification: "advisory",
        review: "possible workspace debris",
        path: candidate.path,
        kind: candidate.kind,
        modifiedTimestampMs: candidate.modifiedTimestampMs,
        ageSource: "mtime",
        ageUncertainty: "Modification time is filesystem metadata. " +
            "Copying, restoring, extracting, or rebuilding can change it.",
        ignore: "ignore" in candidate ? candidate.ignore : undefined,
        detectedReferenceEvidence: [],
        analysisBoundary,
        unobservedReferenceMechanisms: unobservedMechanisms,
    };
}
//# sourceMappingURL=workspace-finding.js.map