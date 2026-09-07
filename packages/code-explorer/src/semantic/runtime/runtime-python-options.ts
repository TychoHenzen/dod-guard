import { pathToFileURL } from "node:url";
import type { BackendLaunchPolicy } from "../backend-launch/types.js";
import type { RelationCapabilities } from "../contracts/contract.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import type { PythonMirror } from "../python-mirror/python-mirror-type.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";
import type { RuntimeLspBackendOptions } from "./runtime-lsp-options.js";

export type PythonRuntimeInput = {
  projectRoot: ProjectRoot;
  policy: BackendLaunchPolicy;
  capabilities: RelationCapabilities;
  options: {
    symbols: Map<string, import("../contracts/contract.js").SymbolIdentity>;
    spawn?: Parameters<typeof createRuntimeLspBackend>[0]["spawn"];
  };
};

export function createPythonRuntimeOptions(
  input: Pick<
    PythonRuntimeInput,
    "projectRoot" | "policy" | "capabilities" | "options"
  >,
  mirror: PythonMirror,
): RuntimeLspBackendOptions {
  return {
    language: "python",
    root: input.projectRoot,
    root_uri: pathToFileURL(mirror.root).href,
    revision: {
      generation: mirror.generation,
      manifest_sha256: "python-mirror",
    },
    symbols: input.options.symbols,
    capabilities: input.capabilities,
    initial_document_paths: mirror.sourcePaths(),
    toBackendUri: (location) => mirror.uriFor(location.path),
    fromBackendUri: (uri) => mirror.pathForUri(uri),
    prepare: () => input.policy.prepare("python"),
    confirmInitialized: () => input.policy.confirmInitialized("python"),
    ...(input.options.spawn ? { spawn: input.options.spawn } : {}),
  };
}
