import type { ArchitectureMemberKind } from "./architecture-member-kind.js";
import type { ArchitectureVisibility } from "./architecture-visibility.js";

export interface ArchitectureMemberFact {
  name: string;
  kind: ArchitectureMemberKind;
  visibility: ArchitectureVisibility;
}
