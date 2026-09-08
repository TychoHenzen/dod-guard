import type { BurstFileActivity, ReferenceGraph } from "./types.js";

export function activity(
  path: string,
  burstCommits: number,
  postBurstCommits = 0,
): BurstFileActivity {
  return {
    identity: path,
    path,
    burstCommits,
    postBurstCommits,
    createdInBurst: true,
    existsAtHead: true,
  };
}

export function referenceEdge(input: {
  sourcePath: string;
  targetPath: string;
  start: number;
  column: number;
  kind?: ReferenceGraph["edges"][number]["kind"];
  strength?: ReferenceGraph["edges"][number]["strength"];
}): ReferenceGraph["edges"][number] {
  return {
    sourcePath: input.sourcePath,
    targetPath: input.targetPath,
    language: "typescript",
    kind: input.kind ?? "import",
    strength: input.strength ?? "strong",
    span: {
      start: input.start,
      end: input.start + 1,
      line: 1,
      column: input.column,
    },
  };
}
