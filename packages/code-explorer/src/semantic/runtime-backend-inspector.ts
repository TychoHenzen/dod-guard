import type { BackendIdentity } from "./backend-identity.js";
import type { Language } from "./contract.js";

export type RuntimeBackendInspector = (
  language: Language,
  executableBasename: string,
) => BackendIdentity | undefined;
