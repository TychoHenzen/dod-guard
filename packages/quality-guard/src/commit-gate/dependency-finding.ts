import type { DependencyEdge } from "./dependency-edge.js";

export type DependencyFinding =
  | {
      kind: "forbidden-direction";
      from: string;
      to: string;
      dependency: string;
      fromGroup: string;
      toGroup: string;
    }
  | { kind: "cycle"; cycle: string[]; stagedEdge: DependencyEdge };
