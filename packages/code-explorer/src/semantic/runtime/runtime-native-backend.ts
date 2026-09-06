import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  BackendLaunchPolicy,
} from "../backend-launch/backend-launch-policy.js";
import type { Language, RelationCapabilities } from "../contracts/contract.js";
import { createFilteredWorkspace } from "../workspace/filtered-workspace.js";
import type { ProjectRoot } from "../project-root/project-root.js";
import { createRuntimeLspBackend } from "./runtime-lsp-backend.js";

export function createNativeRuntimeBackend(input: {
  backend: {
    language: Language;
  };
  policy: BackendLaunchPolicy;
  capabilities: RelationCapabilities;
  root: ProjectRoot;
  filtered: ReturnType<typeof createFilteredWorkspace> | undefined;
}): ReturnType<typeof createRuntimeLspBackend> {
  const { backend, policy, capabilities, root, filtered } = input;
  return createRuntimeLspBackend({
    language: backend.language,
    root,
    root_uri: pathToFileURL(root.canonicalPath).href,
    revision: { generation: 0, manifest_sha256: "runtime" },
    symbols: new Map(),
    capabilities,
    initial_document_paths: initialDocuments(backend.language, filtered),
    toBackendUri: (location) =>
      pathToFileURL(root.resolveClientPath(location.path)).href,
    fromBackendUri: (uri) => backendPath(root, uri),
    prepare: () => policy.prepare(backend.language),
    confirmInitialized: () => policy.confirmInitialized(backend.language),
  });
}

function initialDocuments(
  language: string,
  filtered: ReturnType<typeof createFilteredWorkspace> | undefined,
): readonly string[] | undefined {
  return language === "csharp"
    ? filtered?.sourcePaths().filter((path) => /\.cs$/iu.test(path))
    : undefined;
}

function backendPath(root: ProjectRoot, uri: string): string | undefined {
  if (!uri.startsWith("file:")) return undefined;
  const classified = root.classifyBackendPath(fileURLToPath(uri));
  return "relative_path" in classified ? classified.relative_path : undefined;
}
