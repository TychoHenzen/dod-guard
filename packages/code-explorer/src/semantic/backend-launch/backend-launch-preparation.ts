import type { BackendLaunchFailure } from "./backend-launch-failure.js";

export type BackendLaunchPreparation =
  | {
      status: "ready";
      executable: string;
      version: string;
      arguments: readonly string[];
      shell: false;
      environment: Readonly<Record<string, string>>;
      endpoint: "stdio" | string;
      safe_initialization_options: Readonly<Record<string, unknown>>;
      event?: "project_backend_config_ignored";
    }
  | { status: "unavailable"; code: BackendLaunchFailure };
