import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendInspection } from "./backend-inspection-result.js";
import { rejected } from "./backend-inspection-result.js";
import { validateEntrypoint } from "./backend-launch-entrypoint-validation.js";
import type * as launchOptions from "./backend-launch-policy-options.js";

export function validateEntrypoints(
  entry: BackendAllowlistEntry,
  identity: BackendIdentity,
  options: launchOptions.BackendLaunchPolicyOptions,
): Extract<BackendInspection, { status: "rejected" }> | undefined {
  const expected = entrypointNames(entry);
  const actual = entrypointFiles(identity);
  if (!sameEntrypointCount(actual, expected))
    return rejected("backend_identity_unverifiable");
  return firstEntrypointFailure({
    actual,
    expected,
    entry,
    options,
  });
}

function entrypointNames(entry: BackendAllowlistEntry): readonly string[] {
  return entry.entrypoint_basenames ?? [];
}

function entrypointFiles(
  identity: BackendIdentity,
): NonNullable<BackendIdentity["entrypoints"]> {
  return identity.entrypoints ?? [];
}

function sameEntrypointCount(
  actual: readonly unknown[],
  expected: readonly unknown[],
): boolean {
  return actual.length === expected.length;
}

function firstEntrypointFailure(input: {
  actual: NonNullable<BackendIdentity["entrypoints"]>;
  expected: readonly string[];
  entry: BackendAllowlistEntry;
  options: launchOptions.BackendLaunchPolicyOptions;
}) {
  for (const [index, file] of input.actual.entries()) {
    const failure = validateEntrypoint({
      file,
      expected: input.expected[index] ?? "",
      checksum: input.entry.entrypoint_sha256s?.[index],
      options: input.options,
    });
    if (failure) return failure;
  }
  return undefined;
}
