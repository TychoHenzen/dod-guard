import type { BackendLaunchFailure } from "./backend-launch-policy.js";
import type { DirectLspScheduler, LspProcess } from "./direct-lsp.js";
import type { DirectLspSemanticOptions } from "./direct-lsp-semantic.js";

export type RuntimeLspBackendOptions = Omit<
  DirectLspSemanticOptions,
  "client"
> & {
  root_uri: string;
  initial_document_paths?: readonly string[];
  safe_initialization_options: Record<string, unknown>;
  prepare: () =>
    | {
        status: "ready";
        executable: string;
        arguments: readonly string[];
        environment: Readonly<Record<string, string>>;
      }
    | { status: "unavailable"; code: BackendLaunchFailure };
  confirmInitialized: () =>
    | { status: "ready" }
    | {
        status: "unavailable";
        code: BackendLaunchFailure;
        terminate: true;
      };
  dispose?: () => void;
  spawn?: (
    executable: string,
    arguments_: readonly string[],
    environment: Readonly<Record<string, string>>,
  ) => LspProcess;
  scheduler?: DirectLspScheduler;
};
