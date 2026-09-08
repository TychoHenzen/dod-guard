import type { referenceSources } from "./repository-analysis-references.js";
import type { analyzeWorkspaceStage } from "./repository-analysis-workspace.js";
export declare function buildWorkspaceDebrisFindings({ candidates, references, inventory, root }: {
    candidates: Awaited<ReturnType<typeof analyzeWorkspaceStage>>["workspaceCandidates"];
    references: ReturnType<typeof referenceSources>;
    inventory: readonly string[];
    root: string;
}): import("./types.js").WorkspaceDebrisFinding[];
