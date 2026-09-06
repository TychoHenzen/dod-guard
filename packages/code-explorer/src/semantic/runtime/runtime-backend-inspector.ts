import type { BackendIdentity } from "../backend-launch/backend-identity.js";
import type { Language } from "../contracts/contract.js";

export type RuntimeBackendInspector = (
  language: Language,
  executableBasename: string,
) => BackendIdentity | undefined;
