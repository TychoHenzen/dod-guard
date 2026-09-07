import { semanticClient } from "./direct-lsp-semantic-client.js";

export function workspaceSearchClient(methods: string[]) {
  return semanticClient(async (method: string) => {
    methods.push(method);
    return method === "workspace/symbol"
      ? [{ name: "helper", kind: 12, location: { uri: "file:///project/src/main.rs", range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } } } }]
      : [];
  });
}

export function pythonDocumentSymbolClient(methods: string[]) {
  return semanticClient(async (method: string) => {
    methods.push(method);
    return method === "textDocument/documentSymbol"
      ? [{
          name: "helper",
          kind: 12,
          range: { start: { line: 3, character: 0 }, end: { line: 4, character: 8 } },
          selectionRange: { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } },
        }]
      : [];
  });
}

export function pythonDiscoverySymbol(index: number) {
  return {
    id: `python:src/main.py:${index}`,
    name: "helper",
    language: "python" as const,
    kind: "function" as const,
    location: { path: "src/main.py", range: { start: { line: 3, character: 4 }, end: { line: 3, character: 10 } } },
  };
}

export function csharpDiscoverySymbol() {
  return {
    id: "csharp:src/Demo.cs:2",
    name: "Helper",
    language: "csharp" as const,
    kind: "method" as const,
    location: { path: "src/Demo.cs", range: { start: { line: 2, character: 24 }, end: { line: 2, character: 30 } } },
  };
}
