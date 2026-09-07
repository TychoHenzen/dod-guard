import type { SemanticRequest, SymbolIdentity } from "../contracts/contract.js";
import { documentSymbols } from "./direct-lsp-semantic-document-symbols.js";
import type * as semanticOptions from "./direct-lsp-semantic-options.js";
import { methodFor, paramsFor } from "./direct-lsp-semantic-protocol.js";
import { sourcePathSymbols } from "./direct-lsp-semantic-source-symbols.js";

export async function requestLsp(
  request: SemanticRequest,
  source: SymbolIdentity | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): Promise<unknown> {
  if (request.operation === "focus") return undefined;
  if (request.operation === "search") return requestSearch(request, options);
  if (request.operation === "callers" || request.operation === "callees")
    return requestHierarchy(request, source, options);
  return options.client.request(
    methodFor(request.operation),
    paramsFor(request, source, options),
  );
}

async function requestSearch(
  request: Extract<SemanticRequest, { operation: "search" }>,
  options: semanticOptions.DirectLspSemanticOptions,
): Promise<unknown> {
  const paths = options.discovery_document_paths;
  if (!paths?.length)
    return options.client.request("workspace/symbol", {
      query: request.query,
    });
  const symbols: Record<string, unknown>[] = [];
  for (const path of paths) {
    const uri = options.toBackendUri(emptyLocation(path));
    const reply = await options.client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    const semantic = documentSymbols(reply, uri);
    symbols.push(
      ...(semantic.length > 0
        ? semantic
        : sourcePathSymbols(
            options.language,
            options.root.protectedRead(path).bytes,
            uri,
          ).slice(0, 4096 - symbols.length)),
    );
    if (symbols.length >= 4096) break;
  }
  return symbols;
}

function requestHierarchy(
  request: SemanticRequest,
  source: SymbolIdentity | undefined,
  options: semanticOptions.DirectLspSemanticOptions,
): Promise<unknown> {
  if (!source) throw new Error("backend_unavailable");
  return requestHierarchyItem(request, source, options);
}

async function requestHierarchyItem(
  request: SemanticRequest,
  source: SymbolIdentity,
  options: semanticOptions.DirectLspSemanticOptions,
): Promise<unknown> {
  const prepared = await options.client.request(
    "textDocument/prepareCallHierarchy",
    paramsFor(request, source, options),
  );
  const item = Array.isArray(prepared) ? prepared[0] : prepared;
  if (!item || typeof item !== "object") return [];
  const method =
    request.operation === "callers"
      ? "callHierarchy/incomingCalls"
      : "callHierarchy/outgoingCalls";
  return options.client.request(method, { item });
}

function emptyLocation(path: string): SymbolIdentity["location"] {
  return {
    path,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  };
}
