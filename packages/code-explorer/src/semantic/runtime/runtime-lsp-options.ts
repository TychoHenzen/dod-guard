import type {
  BackendLaunchConfirmation,
  BackendLaunchPreparation,
} from "../backend-launch/types.js";
import type {
  DirectLspScheduler,
  LspProcess,
} from "../direct-lsp/direct-lsp.js";
import type { DirectLspSemanticOptions } from "../direct-lsp/semantic.js";

export type RuntimeLspBackendOptions = Omit<
  DirectLspSemanticOptions,
  "client"
> & {
  root_uri: string;
  initial_document_paths?: readonly string[];
  prepare: () => BackendLaunchPreparation;
  confirmInitialized: () => BackendLaunchConfirmation;
  dispose?: () => void;
  spawn?: (
    executable: string,
    arguments_: readonly string[],
    environment: Readonly<Record<string, string>>,
  ) => LspProcess;
  scheduler?: DirectLspScheduler;
};
