import type { InjectedSemanticBackend } from "./language-adapter.js";
import type { createPythonMirrorManager } from "./python-mirror-runtime.js";
import type { createRuntimeLspBackend } from "./runtime-lsp-backend.js";
import type { PythonRuntimeInput } from "./runtime-python-options.js";

export type PythonBuildInput = PythonRuntimeInput & {
  manager: ReturnType<typeof createPythonMirrorManager>;
  getInner: () => ReturnType<typeof createRuntimeLspBackend> | undefined;
  setInner: (
    value: ReturnType<typeof createRuntimeLspBackend> | undefined,
  ) => void;
  getState: () => ReturnType<InjectedSemanticBackend["readiness"]>;
  setState: (value: ReturnType<InjectedSemanticBackend["readiness"]>) => void;
};
