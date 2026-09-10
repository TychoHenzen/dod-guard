import type { ArchitectureTypeFact } from "./architecture-type-fact.js";

export interface ArchitectureFileFact {
  path: string;
  imports: string[];
  references: string[];
  types: ArchitectureTypeFact[];
}
