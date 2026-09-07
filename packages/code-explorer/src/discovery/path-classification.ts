import type { ClassificationSource } from "./classification-source.js";
import type { ContentClass } from "./content-class.js";

export type PathClassification = {
  content: ContentClass;
  source: ClassificationSource;
};
