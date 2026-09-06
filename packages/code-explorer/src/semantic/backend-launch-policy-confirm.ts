import type { BackendAllowlistEntry } from "./backend-allowlist-entry.js";
import type { BackendIdentity } from "./backend-identity.js";
import type { BackendLaunchFailure } from "./backend-launch-failure.js";
import { sameIdentity } from "./backend-launch-identity.js";
import { inspect } from "./backend-launch-inspection.js";
import { isPermittedEndpoint } from "./backend-launch-paths.js";
import type * as launchOptions from "./backend-launch-policy-options.js";
import type { Language } from "./contract.js";

export function confirmBackend(input: {
  language: Language;
  accepted: Map<
    Language,
    {
      entry: BackendAllowlistEntry;
      identity: Required<BackendIdentity>;
    }
  >;
  options: launchOptions.BackendLaunchPolicyOptions;
  platform: "posix" | "win32";
}):
  | { status: "ready" }
  | {
      status: "unavailable";
      code: BackendLaunchFailure;
      terminate: true;
    } {
  const prior = input.accepted.get(input.language);
  if (!prior)
    return {
      status: "unavailable",
      code: "backend_unavailable",
      terminate: true,
    };
  const inspected = inspect(prior.entry, input.options);
  if (
    inspected.status === "accepted" &&
    sameIdentity(prior.identity, inspected.identity, input.platform)
  )
    return { status: "ready" };
  input.accepted.delete(input.language);
  return {
    status: "unavailable",
    code:
      inspected.status === "accepted" ||
      inspected.code === "version_incompatible"
        ? "backend_identity_changed"
        : inspected.code,
    terminate: true,
  };
}

export function endpointStatus(
  language: Language,
  endpoint: string,
  allowlist: readonly BackendAllowlistEntry[],
):
  | { status: "ready" }
  | {
      status: "unavailable";
      code: "backend_endpoint_rejected";
    } {
  const entry = allowlist.find((candidate) => candidate.language === language);
  return entry?.endpoint === endpoint && isPermittedEndpoint(endpoint)
    ? { status: "ready" }
    : {
        status: "unavailable",
        code: "backend_endpoint_rejected",
      };
}

export function rejectBackendRequest(method: string): {
  accepted: false;
  code: "backend_write_rejected" | "backend_request_rejected";
} {
  return {
    accepted: false,
    code:
      method === "workspace/applyEdit" || method.startsWith("workspace/")
        ? "backend_write_rejected"
        : "backend_request_rejected",
  };
}

export function safeOptions(
  language: Language,
  allowlist: readonly BackendAllowlistEntry[],
): Readonly<Record<string, unknown>> | undefined {
  return allowlist.find((entry) => entry.language === language)
    ?.safe_initialization_options;
}
