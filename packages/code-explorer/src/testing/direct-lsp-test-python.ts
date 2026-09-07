import assert from "node:assert/strict";
import { FakeProcess } from "./direct-lsp-test-process.js";

export function assertPythonConfiguration(process: FakeProcess): void {
  assert.deepEqual(process.sent[2], {
    jsonrpc: "2.0",
    method: "workspace/didChangeConfiguration",
    params: {
      settings: {
        python: {
          analysis: { diagnosticMode: "workspace", indexing: true, useLibraryCodeForTypes: false },
        },
      },
    },
  });
  process.respond({
    jsonrpc: "2.0",
    id: 7,
    method: "workspace/configuration",
    params: { items: [{ section: "python.pythonPath" }, { section: "other" }] },
  });
  assert.deepEqual(process.sent.at(-1), { jsonrpc: "2.0", id: 7, result: [[], null] });
}
