import type { createDirectLspClient } from "./direct-lsp.js";
import type { InjectedSemanticBackend } from "./language-adapter.js";
import type { RuntimeLspBackendOptions } from "./runtime-lsp-options.js";

export type RuntimeLspState = {
  state: ReturnType<InjectedSemanticBackend["readiness"]>;
  inner: InjectedSemanticBackend | undefined;
  client: ReturnType<typeof createDirectLspClient> | undefined;
  started: Promise<void> | undefined;
  disposed: boolean;
  refreshRequired: boolean;
  options: RuntimeLspBackendOptions;
};
