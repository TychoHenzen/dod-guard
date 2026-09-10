import type { ArchitectureVisibility } from "./architecture-visibility.js";

export interface ArchitectureMemberFact {
  name: string;
  kind: "method" | "field";
  visibility: ArchitectureVisibility;
}
