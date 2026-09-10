import type { ArchitectureMemberFact } from "./architecture-member-fact.js";
import type { ForwardingPathFact } from "./forwarding-path-fact.js";

export interface ArchitectureTypeFact {
  name: string;
  members: ArchitectureMemberFact[];
  dependencies: string[];
  forwardingPaths: ForwardingPathFact[];
}
