import type { BackendIdentity } from "./backend-identity.js";
import type { BackendLaunchFailure } from "./backend-launch-failure.js";

export type BackendInspection =
  | {
      status: "accepted";
      identity: Required<BackendIdentity>;
    }
  | {
      status: "rejected";
      code:
        | Exclude<BackendLaunchFailure, "unsupported_backend_version">
        | "version_incompatible";
    };

export function rejected(
  code: Extract<BackendInspection, { status: "rejected" }>["code"],
): Extract<BackendInspection, { status: "rejected" }> {
  return { status: "rejected", code };
}
