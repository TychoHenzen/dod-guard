import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import { isCompleteBackendFile } from "./backend-file-identity.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendInspection } from "./backend-inspection-result.js";
import { rejected } from "./backend-inspection-result.js";
import { basename, isWithin, platformForHost } from "./backend-launch-paths.js";
import type * as launchOptions from "./backend-launch-policy-options.js";

export function validatePackageMetadata(
  entry: BackendAllowlistEntry,
  identity: BackendIdentity,
  options: launchOptions.BackendLaunchPolicyOptions,
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  const expected = entry.package_metadata_sha256;
  if (!metadataHashConfigured(expected))
    return missingMetadataResult(identity.package_metadata);
  const metadata = identity.package_metadata;
  if (!metadata) return rejected("backend_identity_changed");
  const platform = options.platform ?? platformForHost();
  return validateMetadataEvidence({
    metadata,
    expected,
    options,
    platform,
  });
}

function metadataHashConfigured(
  value: string | null | undefined,
): value is string {
  return value !== null && value !== undefined;
}

function missingMetadataResult(
  metadata: BackendIdentity["package_metadata"],
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  return metadata ? rejected("backend_identity_changed") : undefined;
}

function validateMetadataEvidence(input: {
  metadata: NonNullable<BackendIdentity["package_metadata"]>;
  expected: string;
  options: launchOptions.BackendLaunchPolicyOptions;
  platform: "posix" | "win32";
}): Extract<BackendInspection, { status: "rejected" }> | undefined {
  if (!isCompleteBackendFile(input.metadata))
    return rejected("backend_identity_changed");
  if (!safeMetadataPath(input.metadata, input.options, input.platform))
    return rejected("backend_identity_changed");
  return validHash(input.metadata.sha256) &&
    input.metadata.sha256 === input.expected
    ? undefined
    : rejected("backend_identity_changed");
}

function safeMetadataPath(
  metadata: NonNullable<BackendIdentity["package_metadata"]>,
  options: launchOptions.BackendLaunchPolicyOptions,
  platform: "posix" | "win32",
): boolean {
  if (!metadata.canonical_path) return false;
  if (isWithin(options.project_root, metadata.canonical_path, platform))
    return false;
  return basename(metadata.canonical_path, platform) === "package.json";
}

function validHash(value: string | undefined): value is string {
  return !!value && /^[a-f0-9]{64}$/i.test(value);
}
