import { hasInboundWorkspaceUsage } from "./workspace-usage.js";
function createWorkspaceDebrisFinding(input) {
    const { candidate, analysisBoundary, unobservedMechanisms } = input;
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
/** Creates an advisory finding when no inbound usage is discovered. */
export function workspaceDebrisFinding(input) {
    const { candidate, sources, inventoryPaths, analysisBoundary, unobservedMechanisms, } = input;
    if (hasInboundWorkspaceUsage({
        candidatePath: candidate.path,
        sources,
        inventoryPaths,
        graph: input.referenceGraph,
    }))
        return undefined;
    return createWorkspaceDebrisFinding(input);
}
//# sourceMappingURL=workspace-finding.js.map