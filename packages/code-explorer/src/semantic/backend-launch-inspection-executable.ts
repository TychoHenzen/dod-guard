import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import { isCompleteBackendFile } from "./backend-file-identity.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendInspection } from "./backend-inspection-result.js";
import { rejected } from "./backend-inspection-result.js";
import {
  basename,
  isWithin,
  platformForHost,
  samePath,
} from "./backend-launch-paths.js";
import type * as launchOptions from "./backend-launch-policy-options.js";

export function validateExecutable(
  entry: BackendAllowlistEntry,
  identity: BackendIdentity,
  options: launchOptions.BackendLaunchPolicyOptions,
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  const version = identity.version;
  if (!launchIdentityComplete(identity))
    return rejected("backend_identity_unverifiable");
  if (!version) return rejected("backend_identity_unverifiable");
  return (
    validateExecutablePath({ entry, identity, options }) ??
    validateExecutableEvidence(identity, entry, version)
  );
}

function validateExecutablePath(input: {
  entry: BackendAllowlistEntry;
  identity: BackendIdentity;
  options: launchOptions.BackendLaunchPolicyOptions;
}): Extract<BackendInspection, { status: "rejected" }> | undefined {
  const platform = input.options.platform ?? platformForHost();
  return safeExecutablePath({ ...input, platform })
    ? undefined
    : rejected("backend_identity_unverifiable");
}

function validateExecutableEvidence(
  identity: BackendIdentity,
  entry: BackendAllowlistEntry,
  version: string,
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  if (!validHash(identity.sha256))
    return rejected("backend_identity_unverifiable");
  if (identity.sha256 !== entry.executable_sha256)
    return rejected("backend_identity_changed");
  if (!versionMatches(version, entry.compatible_version))
    return rejected("version_incompatible");
  return undefined;
}

function launchIdentityComplete(identity: BackendIdentity): boolean {
  return completeIdentity(identity) && !!identity.version;
}

function completeIdentity(identity: BackendIdentity): boolean {
  return isCompleteBackendFile(identity);
}

function safeExecutablePath(input: {
  entry: BackendAllowlistEntry;
  identity: BackendIdentity;
  options: launchOptions.BackendLaunchPolicyOptions;
  platform: "posix" | "win32";
}): boolean {
  return !!(
    input.identity.canonical_path &&
    !isWithin(
      input.options.project_root,
      input.identity.canonical_path,
      input.platform,
    ) &&
    samePath(
      basename(input.identity.canonical_path, input.platform),
      input.entry.executable_basename,
      input.platform,
    )
  );
}

function validHash(value: string | undefined): value is string {
  return !!value && /^[a-f0-9]{64}$/i.test(value);
}

function versionMatches(version: string, compatibleRange: string): boolean {
  if (!compatibleRange.startsWith("^")) return version === compatibleRange;
  const [major] = compatibleRange.slice(1).split(".");
  return version.split(".")[0] === major;
}
