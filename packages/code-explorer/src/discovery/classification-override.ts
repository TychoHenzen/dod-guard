import type { ContentClass } from "./content-class.js";

export type ClassificationOverride = {
  glob: string;
  class: Exclude<ContentClass, "unknown">;
};
