import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import { resolveArguments } from "./backend-launch-identity.js";
import type { BackendLaunchPreparation } from "./backend-launch-preparation.js";

export function readyPreparation(
  entry: BackendAllowlistEntry,
  identity: Required<BackendIdentity>,
  projectConfiguration: unknown,
): BackendLaunchPreparation {
  return {
    status: "ready",
    executable: identity.canonical_path,
    version: identity.version,
    arguments: resolveArguments(entry.arguments, identity.entrypoints),
    shell: false,
    environment: entry.environment,
    endpoint: entry.endpoint,
    safe_initialization_options: entry.safe_initialization_options,
    ...(projectConfiguration === undefined
      ? {}
      : { event: "project_backend_config_ignored" }),
  };
}
