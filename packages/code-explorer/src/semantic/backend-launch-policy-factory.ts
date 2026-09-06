import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import {
  confirmBackend,
  endpointStatus,
  rejectBackendRequest,
  safeOptions,
} from "./backend-launch-policy-confirm.js";
import type * as launchOptions from "./backend-launch-policy-options.js";
import { prepareBackend } from "./backend-launch-policy-prepare.js";
import { defaultPlatform } from "./backend-launch-preparation-result.js";
import {
  deepFreeze,
  snapshotAllowlistEntry,
} from "./backend-launch-snapshot.js";
import type { Language } from "./contract.js";

export function createBackendLaunchPolicy(
  options: launchOptions.BackendLaunchPolicyOptions,
) {
  const platform = options.platform ?? defaultPlatform();
  const allowlist = deepFreeze(options.allowlist.map(snapshotAllowlistEntry));
  const policyOptions = { ...options, allowlist, platform };
  const accepted = new Map<
    Language,
    {
      entry: BackendAllowlistEntry;
      identity: Required<BackendIdentity>;
    }
  >();
  return createPolicyMethods({
    allowlist,
    policyOptions,
    accepted,
    platform,
  });
}

function createPolicyMethods(input: {
  allowlist: readonly BackendAllowlistEntry[];
  policyOptions: launchOptions.BackendLaunchPolicyOptions;
  accepted: Map<
    Language,
    {
      entry: BackendAllowlistEntry;
      identity: Required<BackendIdentity>;
    }
  >;
  platform: "posix" | "win32";
}) {
  return {
    prepare: prepareMethod(input),
    confirmInitialized: confirmMethod(input),
    setEndpoint: endpointMethod(input),
    handleBackendRequest: requestMethod,
    safeOptions: safeOptionsMethod(input),
  };
}

function prepareMethod(input: Parameters<typeof createPolicyMethods>[0]) {
  return (language: Language, projectConfiguration?: unknown) =>
    prepareBackend({
      language,
      projectConfiguration,
      allowlist: input.allowlist,
      options: input.policyOptions,
      accepted: input.accepted,
      platform: input.platform,
    });
}

function confirmMethod(input: Parameters<typeof createPolicyMethods>[0]) {
  return (language: Language) =>
    confirmBackend({
      language,
      accepted: input.accepted,
      options: input.policyOptions,
      platform: input.platform,
    });
}

function endpointMethod(input: Parameters<typeof createPolicyMethods>[0]) {
  return (language: Language, endpoint: string) =>
    endpointStatus(language, endpoint, input.allowlist);
}

function requestMethod(method: string, _params: unknown) {
  return rejectBackendRequest(method);
}

function safeOptionsMethod(input: Parameters<typeof createPolicyMethods>[0]) {
  return (language: Language) => safeOptions(language, input.allowlist);
}
