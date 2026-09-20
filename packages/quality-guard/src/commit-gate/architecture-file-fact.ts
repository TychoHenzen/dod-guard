import type { ArchitectureTypeFact } from "./architecture-type-fact.js";
import type { ConfigurationDefaultFact } from "./configuration-default-fact.js";
import type { TransitiveNavigationFact } from "./transitive-navigation-fact.js";

export interface ArchitectureFileFact {
  path: string;
  imports: string[];
  references: string[];
  types: ArchitectureTypeFact[];
  configurationDefaults?: ConfigurationDefaultFact[];
  transitiveNavigation?: TransitiveNavigationFact[];
}
