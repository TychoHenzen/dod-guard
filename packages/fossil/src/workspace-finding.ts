import type { ReferenceSourceContent } from "./reference-analysis-types.js";
import type { ReferenceGraph, WorkspaceDebrisFinding } from "./types.js";
import type {
  IgnoredWorkspaceCandidate,
  UntrackedWorkspaceCandidate,
} from "./workspace-types/index.js";
import { hasInboundWorkspaceUsage } from "./workspace-usage.js";

type WorkspaceDebrisFindingInput = {
  candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate;
  sources: readonly ReferenceSourceContent[];
  referenceGraph?: ReferenceGraph;
  inventoryPaths: readonly string[];
  analysisBoundary: string;
  unobservedMechanisms: readonly string[];
};

function createWorkspaceDebrisFinding(
  input: WorkspaceDebrisFindingInput,
): WorkspaceDebrisFinding {
  const { candidate, analysisBoundary, unobservedMechanisms } = input;
  return {
    classification: "advisory",
    review: "possible workspace debris",
    path: candidate.path,
    kind: candidate.kind,
    modifiedTimestampMs: candidate.modifiedTimestampMs,
    ageSource: "mtime",
    ageUncertainty:
      "Modification time is filesystem metadata. " +
      "Copying, restoring, extracting, or rebuilding can change it.",
    ignore: "ignore" in candidate ? candidate.ignore : undefined,
    detectedReferenceEvidence: [],
    analysisBoundary,
    unobservedReferenceMechanisms: unobservedMechanisms,
  };
}

/** Creates an advisory finding when no inbound usage is discovered. */
export function workspaceDebrisFinding(
  input: WorkspaceDebrisFindingInput,
): WorkspaceDebrisFinding | undefined {
  const {
    candidate,
    sources,
    inventoryPaths,
    analysisBoundary,
    unobservedMechanisms,
  } = input;
  if (
    hasInboundWorkspaceUsage({
      candidatePath: candidate.path,
      sources,
      inventoryPaths,
      graph: input.referenceGraph,
    })
  )
    return undefined;
  return createWorkspaceDebrisFinding(input);
}
