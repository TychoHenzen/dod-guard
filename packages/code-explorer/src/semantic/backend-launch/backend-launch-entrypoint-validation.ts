import { isCompleteBackendFile } from "./backend-file-identity.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendInspection } from "./backend-inspection-result.js";
import { rejected } from "./backend-inspection-result.js";
import * as launchPaths from "./backend-launch-paths.js";
import type * as launchOptions from "./backend-launch-policy-options.js";

export function validateEntrypoint(input: {
  file: NonNullable<BackendIdentity["entrypoints"]>[number];
  expected: string;
  checksum: string | undefined;
  options: launchOptions.BackendLaunchPolicyOptions;
}): Extract<BackendInspection, { status: "rejected" }> | undefined {
  const platform = input.options.platform ?? launchPaths.platformForHost();
  const failure = invalidEntrypoint(input, platform);
  if (failure) return failure;
  return input.file.sha256 === input.checksum
    ? undefined
    : rejected("backend_identity_changed");
}

function invalidEntrypoint(
  input: {
    file: NonNullable<BackendIdentity["entrypoints"]>[number];
    expected: string;
    options: launchOptions.BackendLaunchPolicyOptions;
  },
  platform: "posix" | "win32",
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  if (!isCompleteBackendFile(input.file))
    return rejected("backend_identity_unverifiable");
  if (!safeEntryPath({ ...input, platform }))
    return rejected("backend_identity_unverifiable");
  if (!validHash(input.file.sha256))
    return rejected("backend_identity_unverifiable");
  return undefined;
}

function safeEntryPath(input: {
  file: NonNullable<BackendIdentity["entrypoints"]>[number];
  expected: string;
  options: launchOptions.BackendLaunchPolicyOptions;
  platform: "posix" | "win32";
}): boolean {
  if (!input.file.canonical_path) return false;
  if (
    launchPaths.isWithin(
      input.options.project_root,
      input.file.canonical_path,
      input.platform,
    )
  )
    return false;
  return launchPaths.samePath(
    launchPaths.basename(input.file.canonical_path, input.platform),
    input.expected,
    input.platform,
  );
}

function validHash(value: string | undefined): value is string {
  return !!value && /^[a-f0-9]{64}$/i.test(value);
}
