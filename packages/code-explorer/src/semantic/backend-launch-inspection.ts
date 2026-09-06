import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendInspection } from "./backend-inspection-result.js";
import { rejected } from "./backend-inspection-result.js";
import { validateExecutable } from "./backend-launch-inspection-executable.js";
import { validateEntrypoints } from "./backend-launch-inspection-files.js";
import * as inspectionMetadata from "./backend-launch-inspection-metadata.js";
import type * as launchOptions from "./backend-launch-policy-options.js";

export function inspect(
  entry: BackendAllowlistEntry,
  options: launchOptions.BackendLaunchPolicyOptions,
): BackendInspection {
  const identity = options.inspect(
    entry.language,
    entry.executable_basename,
    entry.entrypoint_basenames ?? [],
  );
  if (!identity?.canonical_path) return rejected("backend_unavailable");
  const failure = firstInspectionFailure([
    () => validateExecutable(entry, identity, options),
    () => validateEntrypoints(entry, identity, options),
    () => inspectionMetadata.validatePackageMetadata(entry, identity, options),
  ]);
  if (failure) return failure;
  return {
    status: "accepted",
    identity: identity as Required<BackendIdentity>,
  };
}

function firstInspectionFailure(
  checks: readonly (() =>
    | Extract<BackendInspection, { status: "rejected" }>
    | undefined)[],
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  for (const check of checks) {
    const failure = check();
    if (failure) return failure;
  }
  return undefined;
}
