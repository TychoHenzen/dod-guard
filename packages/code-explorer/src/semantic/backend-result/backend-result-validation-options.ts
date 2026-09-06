import type { Language } from "../contracts/contract.js";
import type { ProjectRoot } from "../project-root/project-root.js";

export type BackendResultValidationOptions = {
  allowedLanguages: readonly Language[];
  root: ProjectRoot;
  currentGeneration: number;
};
