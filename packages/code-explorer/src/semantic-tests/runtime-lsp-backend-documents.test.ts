import assert from "node:assert/strict";
import { it } from "node:test";
import { createRuntimeLspBackend } from "../semantic/runtime/runtime-lsp-backend.js";
import {
  assertSourceDocumentOpened,
  Process,
  pythonMirrorOptions,
  runtimeSourceOptions,
} from "../testing/runtime/runtime-lsp-test-support.js";

it("opens approved Python mirror documents before work begins", async () => {
  const process = new Process([], {}, () => []);
  const backend = createRuntimeLspBackend(pythonMirrorOptions(process));
  await backend.query({
    operation: "search",
    query: "helper",
  });
  assert.deepEqual(
    process.sent.filter((message) => message.method === "textDocument/didOpen").map((message) => message.params),
    [
      {
        textDocument: {
          uri: "file:///mirror/a.py",
          languageId: "python",
          version: 0,
          text: "def helper():\n    pass\n",
        },
      },
    ],
  );
});

it("opens the protected source before a real LSP request", async () => {
  const process = new Process([], { definitionProvider: true }, (method) =>
    method === "textDocument/definition"
      ? [
          {
            uri: "file:///project/a.rs",
            range: {
              start: { line: 0, character: 7 },
              end: { line: 0, character: 13 },
            },
          },
        ]
      : [],
  );
  const backend = createRuntimeLspBackend(runtimeSourceOptions(process));
  await backend.query({
    operation: "definition",
    symbol_id: "entry",
  });
  assertSourceDocumentOpened(process);
});
