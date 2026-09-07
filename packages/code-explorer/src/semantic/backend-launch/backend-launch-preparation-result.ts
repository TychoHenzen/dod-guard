import type { BackendLaunchFailure } from "./backend-launch-failure.js";
import { platformForHost } from "./backend-launch-paths.js";
import type { BackendLaunchPreparation } from "./backend-launch-preparation.js";

export function preparationFailure(
  code:
    | Exclude<BackendLaunchFailure, "unsupported_backend_version">
    | "version_incompatible",
): BackendLaunchFailure {
  return code === "version_incompatible" ? "unsupported_backend_version" : code;
}

export function unavailable(
  code: BackendLaunchFailure,
): BackendLaunchPreparation {
  return { status: "unavailable", code };
}

export function defaultPlatform(): "posix" | "win32" {
  return platformForHost();
}
