import type { ClassificationOverride } from "./classification-override.js";

export type ClassificationConfig = {
  generated: readonly string[];
  test: readonly string[];
  production: readonly string[];
  overrides: readonly ClassificationOverride[];
};
