import assert from "node:assert/strict";
import { semanticClient } from "./direct-lsp-semantic-client.js";

export function incomingHierarchyClient(methods: string[]) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      return method === "textDocument/prepareCallHierarchy"
        ? [{ name: "entry", kind: 12, uri: "file:///project/src/main.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }]
        : [{
            from: { name: "caller", kind: 12, uri: "file:///project/src/main.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } },
            fromRanges: [{ start: { line: 0, character: 2 }, end: { line: 0, character: 4 } }],
          }];
    },
    { callHierarchyProvider: true },
  );
}

export function outgoingHierarchyClient(methods: string[]) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      return method === "textDocument/prepareCallHierarchy"
        ? [{ name: "entry" }]
        : [{
            to: { name: "callee", kind: 6, uri: "file:///project/src/main.rs", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } } },
            fromRanges: [{ start: { line: 0, character: 3 }, end: { line: 0, character: 5 } }],
          }];
    },
    { callHierarchyProvider: true },
  );
}

export function assertHierarchyRelation(
  result: unknown,
  operation: "callers" | "callees",
  name: string,
  callSiteCharacter: number,
): void {
  const output = result as { operation: string; relations: unknown[] };
  assert.equal(output.operation, operation);
  const relation = output.relations[0] as { symbol?: { name: string }; location?: { range: { start: { character: number } } }; call_site?: { range: { start: { character: number } } } };
  assert.ok(relation?.symbol);
  assert.equal(relation.symbol.name, name);
  assert.equal(relation.location?.range.start.character, 0);
  assert.equal(relation.call_site?.range.start.character, callSiteCharacter);
}
