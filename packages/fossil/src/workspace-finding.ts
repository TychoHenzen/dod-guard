import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import type { WorkspaceDebrisFinding } from "./types.js";
import type { IgnoredWorkspaceCandidate } from "./workspace-types/ignored-workspace-candidate.js";
import type { UntrackedWorkspaceCandidate } from "./workspace-types/untracked-workspace-candidate.js";
import { hasInboundWorkspaceUsage } from "./workspace-usage.js";

/** Creates a separate advisory workspace-debris finding when no inbound usage evidence is discovered. */
export function workspaceDebrisFinding(
  candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate,
  sources: readonly ReferenceSourceContent[],
  inventoryPaths: readonly string[],
  analysisBoundary: string,
  unobservedMechanisms: readonly string[],
): WorkspaceDebrisFinding | undefined {
  if (hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths)) return undefined;
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path: candidate.path,
    kind: candidate.kind,
    modifiedTimestampMs: candidate.modifiedTimestampMs,
    ageSource: "mtime",
    ageUncertainty:
      "Modification time is filesystem metadata. Copying, restoring, extracting, or rebuilding can change it.",
    ignore: "ignore" in candidate ? candidate.ignore : undefined,
    detectedReferenceEvidence: [],
    analysisBoundary,
    unobservedReferenceMechanisms: unobservedMechanisms,
  };
}
