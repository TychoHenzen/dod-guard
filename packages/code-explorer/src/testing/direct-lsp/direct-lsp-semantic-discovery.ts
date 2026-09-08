import { testLocation, testRange } from "../semantic/semantic-test-shapes.js";
import { semanticClient } from "./direct-lsp-semantic-client.js";

function workspaceSymbols() {
  return [
    {
      name: "helper",
      kind: 12,
      location: {
        uri: "file:///project/src/main.rs",
        range: testRange({ line: 0, character: 3 }, { line: 0, character: 9 }),
      },
    },
  ];
}

function pythonDocumentSymbols() {
  return [
    {
      name: "helper",
      kind: 12,
      range: testRange({ line: 3, character: 0 }, { line: 4, character: 8 }),
      selectionRange: testRange(
        { line: 3, character: 4 },
        { line: 3, character: 10 },
      ),
    },
  ];
}

export function workspaceSearchClient(methods: string[]) {
  return semanticClient(async (method: string) => {
    methods.push(method);
    if (method === "workspace/symbol") return workspaceSymbols();
    return [];
  });
}

export function pythonDocumentSymbolClient(methods: string[]) {
  return semanticClient(async (method: string) => {
    methods.push(method);
    if (method === "textDocument/documentSymbol")
      return pythonDocumentSymbols();
    return [];
  });
}

export function pythonDiscoverySymbol(index: number) {
  return {
    id: `python:src/main.py:${index}`,
    name: "helper",
    language: "python" as const,
    kind: "function" as const,
    location: testLocation(
      "src/main.py",
      { line: 3, character: 4 },
      { line: 3, character: 10 },
    ),
  };
}

export function csharpDiscoverySymbol() {
  return {
    id: "csharp:src/Demo.cs:2",
    name: "Helper",
    language: "csharp" as const,
    kind: "method" as const,
    location: testLocation(
      "src/Demo.cs",
      { line: 2, character: 24 },
      { line: 2, character: 30 },
    ),
  };
}
