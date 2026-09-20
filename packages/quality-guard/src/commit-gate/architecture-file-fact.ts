import type { ArchitectureTypeFact } from "./architecture-type-fact.js";
import type { ConfigurationDefaultFact } from "./design-smells/configuration-default-fact.js";
import type { TransitiveNavigationFact } from "./design-smells/transitive-navigation-fact.js";

export interface ArchitectureFileFact {
  path: string;
  imports: string[];
  references: string[];
  types: ArchitectureTypeFact[];
  configurationDefaults?: ConfigurationDefaultFact[];
  transitiveNavigation?: TransitiveNavigationFact[];
}
