import { configurationDefaults } from "./configuration-facts.mjs";
import { transitiveNavigation } from "./navigation-facts.mjs";

export function designFacts(source, lang) {
  return {
    configurationDefaults: configurationDefaults(source, lang),
    transitiveNavigation: transitiveNavigation(source, lang),
  };
}
