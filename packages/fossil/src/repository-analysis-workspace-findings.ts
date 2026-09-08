import type { referenceSources } from "./repository-analysis-references.js";
import { workspaceDebrisFinding } from "./workspace-debris-boundary.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";

export function buildWorkspaceDebrisFindings({
  candidates,
  references,
  inventory,
  root,
}: {
  candidates: Awaited<
    ReturnType<typeof analyzeWorkspaceStage>
  >["workspaceCandidates"];
  references: ReturnType<typeof referenceSources>;
  inventory: readonly string[];
  root: string;
}) {
  return candidates.flatMap((candidate) => {
    const finding = workspaceDebrisFinding({
      candidate,
      sources: references.sources,
      referenceGraph: references.graph,
      inventoryPaths: inventory,
      analysisBoundary: root,
      unobservedMechanisms: [
        "dynamic runtime loading",
        "reflection",
        "external consumers",
        "generated configuration",
      ],
    });
    return finding ? [finding] : [];
  });
}
