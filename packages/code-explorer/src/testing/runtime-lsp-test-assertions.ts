import assert from "node:assert/strict";
import { Process } from "./runtime-test-process.js";

export function assertSourceDocumentOpened(process: Process): void {
  assert.deepEqual(
    process.sent.filter((message) => message.method?.startsWith("textDocument/")).map((message) => message),
    [
      {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: { uri: "file:///project/a.rs", languageId: "rust", version: 0, text: "pub fn helper() {}\n" },
        },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "textDocument/definition",
        params: { textDocument: { uri: "file:///project/a.rs" }, position: { line: 0, character: 7 } },
      },
    ],
  );
}

export function assertReplacementDocuments(first: Process, replacement: Process): void {
  const countDidOpen = (process: Process) =>
    process.sent.filter((message) => message.method === "textDocument/didOpen").length;
  assert.equal(countDidOpen(first), 1);
  assert.equal(countDidOpen(replacement), 1);
  const methods = replacement.sent
    .filter((message) => message.method?.startsWith("textDocument/"))
    .map((message) => message.method);
  assert.deepEqual(methods, ["textDocument/didOpen", "textDocument/definition", "textDocument/definition"]);
}
