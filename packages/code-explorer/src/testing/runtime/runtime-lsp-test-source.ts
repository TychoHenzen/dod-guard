import type { LspProcess } from "../../semantic/direct-lsp/direct-lsp.js";
import type { RuntimeLspBackendOptions } from "../../semantic/runtime/runtime-lsp-backend.js";
import { unavailableCapabilities } from "./runtime-lsp-test-fixtures.js";
import { runtimeOptions } from "./runtime-lsp-test-options.js";
import { runtimeEntrySymbol } from "./runtime-lsp-test-symbol.js";
import { Process } from "./runtime-test-process.js";

export function pythonMirrorOptions(
  process: LspProcess,
): RuntimeLspBackendOptions {
  return runtimeOptions(process, {
    language: "python",
    root: {
      canonicalPath: "/project",
      revalidate: () => "ready",
      resolveClientPath: () => "/project/a.py",
      classifyBackendPath: () => ({ relative_path: "a.py" }),
      openProtected: () => ({ path: "/project/a.py", handle: undefined }),
      protectedRead: () => ({
        path: "/project/a.py",
        bytes: "def helper():\n    pass\n",
      }),
    } as never,
    root_uri: "file:///mirror",
    capabilities: unavailableCapabilities,
    initial_document_paths: ["a.py"],
    toBackendUri: () => "file:///mirror/a.py",
    fromBackendUri: () => "a.py",
  });
}

export function runtimeSourceOptions(
  process: LspProcess,
  overrides: Partial<RuntimeLspBackendOptions> = {},
): RuntimeLspBackendOptions {
  return runtimeOptions(process, {
    root: {
      canonicalPath: "/project",
      resolveClientPath: () => "/project/a.rs",
      classifyBackendPath: () => ({ relative_path: "a.rs" }),
      openProtected: () => ({ path: "/project/a.rs", handle: undefined }),
      protectedRead: () => ({
        path: "/project/a.rs",
        bytes: "pub fn helper() {}\n",
      }),
    } as never,
    symbols: new Map([["entry", runtimeEntrySymbol()]]),
    ...overrides,
  });
}

export function degradedProcess(): Process {
  return new Process(
    [],
    { definitionProvider: true, referencesProvider: true },
    (method) =>
      method === "textDocument/definition"
        ? [
            {
              uri: "git:/virtual",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ]
        : [
            {
              uri: "file:///project/a.rs",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
            },
          ],
  );
}
