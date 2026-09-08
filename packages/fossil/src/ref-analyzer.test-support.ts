import type { ReferenceGraph } from "./types.js";

export function edgeSummary(graph: ReferenceGraph) {
  return graph.edges.map(
    ({ sourcePath, targetPath, language, kind, strength }) => ({
      sourcePath,
      targetPath,
      language,
      kind,
      strength,
    }),
  );
}
