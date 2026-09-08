import { FossilAnalysisError } from "./analysis-error.js";
import { parseNulDelimitedPaths } from "./workspace-debris-boundary.js";

export function buildWorkspaceInventory(input: {
  trackedOutput: string;
  workspaceCandidates: readonly { readonly path: string }[];
}): string[] {
  return [
    ...new Set([
      ...parseNulDelimitedPaths(input.trackedOutput),
      ...input.workspaceCandidates.map(({ path }) => path),
    ]),
  ].sort();
}

export function assertWorkspaceInventoryLimit(
  inventory: readonly string[],
): void {
  if (inventory.length > 100_000)
    throw new FossilAnalysisError({
      code: "resource_limit",
      message: "File inventory limit exceeded.",
    });
}
