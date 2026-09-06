import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { Language } from "../contracts/contract.js";

export type BackendLaunchPolicyOptions = {
  project_root: string;
  platform?: "posix" | "win32";
  allowlist: readonly BackendAllowlistEntry[];
  inspect(
    language: Language,
    executableBasename: string,
    entrypointBasenames?: readonly string[],
  ): BackendIdentity | undefined;
};
