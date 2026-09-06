import type { Language } from "./contract.js";
import type { ProjectRoot } from "./project-root.js";

export type BackendResultValidationOptions = {
  allowedLanguages: readonly Language[];
  root: ProjectRoot;
  currentGeneration: number;
};
