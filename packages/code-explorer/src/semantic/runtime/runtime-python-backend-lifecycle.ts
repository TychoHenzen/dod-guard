import type { InjectedSemanticBackend } from "../adapters/language-adapter.js";
import type { createPythonMirrorManager } from "../python-mirror/python-mirror-runtime.js";
import type { PythonMirror } from "../python-mirror/python-mirror-type.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";
import type { PythonBuildInput } from "./runtime-python-backend-types.js";
import { createPythonRuntimeOptions } from "./runtime-python-options.js";

export function createPythonBuild(input: PythonBuildInput) {
  return () => refreshPython(input);
}

async function refreshPython(input: PythonBuildInput): Promise<void> {
  const refreshed = await input.manager.refresh();
  if (refreshed.status !== "ready")
    return handleUnavailable(input, refreshed.code);
  ensurePythonInner(input, refreshed.mirror, refreshed.changed);
  await input.getInner()?.start?.();
  input.setState(input.getInner()?.readiness() ?? input.getState());
}

function handleUnavailable(
  input: PythonBuildInput,
  code: "unsafe_backend_mode",
): never {
  input.setState({ state: "unavailable" });
  throw new Error(code);
}

function ensurePythonInner(
  input: PythonBuildInput,
  mirror: PythonMirror,
  changed: boolean,
): void {
  if (!input.getInner() || changed)
    input.setInner(createPythonInner(input, mirror));
}

function createPythonInner(
  input: Pick<
    PythonBuildInput,
    "projectRoot" | "policy" | "capabilities" | "options"
  >,
  mirror: PythonMirror,
): ReturnType<typeof createRuntimeLspBackend> {
  return createRuntimeLspBackend(createPythonRuntimeOptions(input, mirror));
}

export function createPythonShutdown(
  manager: ReturnType<typeof createPythonMirrorManager>,
  getInner: () => ReturnType<typeof createRuntimeLspBackend> | undefined,
  setInner: (
    value: ReturnType<typeof createRuntimeLspBackend> | undefined,
  ) => void,
  setState: (value: ReturnType<InjectedSemanticBackend["readiness"]>) => void,
): () => Promise<void> {
  return async () => {
    await manager.disposeAfterShutdown(async () => {
      await getInner()?.shutdown?.();
      setInner(undefined);
    });
    setState({ state: "unavailable" });
  };
}
