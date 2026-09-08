import assert from "node:assert/strict";
import type {
  ProtectedDocumentContent,
} from "../semantic/direct-lsp/direct-lsp.js";
import { semanticClient } from "./direct-lsp-semantic-client.js";
import { testRange } from "./semantic-test-shapes.js";

function definitionLocation() {
  return {
    uri: "file:///project/src/main.rs",
    range: testRange({ line: 0, character: 3 }, { line: 0, character: 7 }),
  };
}

export function locationClient(
  methods: string[],
  openProtectedDocument?: (
    uri: string,
    content: ProtectedDocumentContent,
  ) => void,
) {
  return semanticClient(
    async (method: string) => {
      methods.push(method);
      return definitionLocation();
    },
    { definitionProvider: true, referencesProvider: true },
    openProtectedDocument,
  );
}

export function virtualLocationClient() {
  return semanticClient(
    async (method: string) =>
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
              uri: "file:///project/src/main.rs",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 1 },
              },
            },
          ],
    { definitionProvider: true, referencesProvider: true },
  );
}

export function externalLocationClient() {
  return semanticClient(
    async () => [
      {
        uri: "file:///outside/lib.rs",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
      },
    ],
    { definitionProvider: true },
  );
}

export function assertOpenedTwice(
  opened: Array<{ uri: string; content: unknown }>,
): void {
  assert.deepEqual(opened, [
    {
      uri: "file:///project/src/main.rs",
      content: { language_id: "rust", bytes: "fn main() {}\n" },
    },
    {
      uri: "file:///project/src/main.rs",
      content: { language_id: "rust", bytes: "fn main() {}\n" },
    },
  ]);
}
