import assert from "node:assert/strict";
import { semanticClient } from "./direct-lsp-semantic-client.js";
import { testRange } from "./semantic-test-shapes.js";

type HierarchyOutput = { operation: string; relations: unknown[] };
type HierarchyRelation = {
  symbol?: { name: string };
  location?: { range: { start: { character: number } } };
  call_site?: { range: { start: { character: number } } };
};

function incomingPrepared() {
  return [
    {
      name: "entry",
      kind: 12,
      uri: "file:///project/src/main.rs",
      range: testRange({ line: 0, character: 0 }, { line: 0, character: 5 }),
    },
  ];
}

function incomingRelations() {
  return [
    {
      from: {
        name: "caller",
        kind: 12,
        uri: "file:///project/src/main.rs",
        range: testRange({ line: 0, character: 0 }, { line: 0, character: 6 }),
      },
      fromRanges: [
        testRange({ line: 0, character: 2 }, { line: 0, character: 4 }),
      ],
    },
  ];
}

function outgoingPrepared() {
  return [{ name: "entry" }];
}

function outgoingRelations() {
  return [
    {
      to: {
        name: "callee",
        kind: 6,
        uri: "file:///project/src/main.rs",
        range: testRange({ line: 0, character: 0 }, { line: 0, character: 6 }),
      },
      fromRanges: [
        testRange({ line: 0, character: 3 }, { line: 0, character: 5 }),
      ],
    },
  ];
}

export function incomingHierarchyClient(methods: string[]) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      if (method === "textDocument/prepareCallHierarchy")
        return incomingPrepared();
      return incomingRelations();
    },
    { callHierarchyProvider: true },
  );
}

export function outgoingHierarchyClient(methods: string[]) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      if (method === "textDocument/prepareCallHierarchy")
        return outgoingPrepared();
      return outgoingRelations();
    },
    { callHierarchyProvider: true },
  );
}

export function assertHierarchyRelation({
  result,
  operation,
  name,
  callSiteCharacter,
}: {
  result: unknown;
  operation: "callers" | "callees";
  name: string;
  callSiteCharacter: number;
}): void {
  const output = result as HierarchyOutput;
  assert.equal(output.operation, operation);
  const relation = output.relations[0] as HierarchyRelation;
  assert.ok(relation?.symbol);
  assert.equal(relation.symbol.name, name);
  assert.equal(relation.location?.range.start.character, 0);
  assert.equal(relation.call_site?.range.start.character, callSiteCharacter);
}
