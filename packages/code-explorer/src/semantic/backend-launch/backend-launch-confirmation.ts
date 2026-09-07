import type { BackendLaunchFailure } from "./backend-launch-failure.js";

export type BackendLaunchConfirmation =
  | { status: "ready" }
  | {
      status: "unavailable";
      code: BackendLaunchFailure;
      terminate: true;
    };
