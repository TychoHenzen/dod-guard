import { createSemanticBackend } from "./direct-lsp-semantic-backend.js";
import { pythonDocumentSymbolClient } from "./direct-lsp-semantic-discovery.js";
import {
  projectBackendPath,
  semanticRootWithRead,
} from "./direct-lsp-semantic-root.js";
import { semanticClient } from "./direct-lsp-semantic-client.js";

export function pythonOpenedDiscoveryBackend(methods: string[]) {
  return createSemanticBackend({
    language: "python",
    root: semanticRootWithRead(
      "/project/src/main.py",
      "def entry():\n    pass\n\ndef helper():\n    pass\n",
    ),
    discovery_document_paths: ["src/main.py"],
    client: pythonDocumentSymbolClient(methods),
    fromBackendUri: projectBackendPath,
  });
}

export function pythonServerPathDiscoveryBackend() {
  return createSemanticBackend({
    language: "python",
    root: semanticRootWithRead(
      "/project/src/main.py",
      "def entry():\n    pass\n\ndef helper():\n    pass\n",
    ),
    discovery_document_paths: ["src/main.py"],
    client: semanticClient(),
    fromBackendUri: projectBackendPath,
  });
}

export function csharpServerPathDiscoveryBackend() {
  const source =
    "class Demo {\n" +
    "    public void Entry() {        Helper(); }\n" +
    "    private static void Helper() { }\n" +
    "}\n";
  return createSemanticBackend({
    language: "csharp",
    root: semanticRootWithRead("/project/src/Demo.cs", source),
    discovery_document_paths: ["src/Demo.cs"],
    client: semanticClient(),
    fromBackendUri: projectBackendPath,
  });
}
