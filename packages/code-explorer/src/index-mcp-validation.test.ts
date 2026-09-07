import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "./index.js";

const entryPoint = fileURLToPath(new URL("./index.js", import.meta.url));

it("rejects unknown and action-mismatched fields before state work", async () => {
  const server = createServer();
  const before = server.state();
  for (const [name, arguments_] of [
    ["code_search", { query: "helper", unexpected: true }],
    ["code_focus", { session_id: "session", request_id: "request", symbol_id: "symbol", limit: 1 }],
    ["code_follow", { session_id: "session", request_id: "request", view_id: "view", handle: "handle", relation: "definition", extra: 1 }],
    ["code_history", { session_id: "session", request_id: "request", action: "back", limit: 1 }],
    ["code_status", { action: "status", session_id: "session" }],
    ["code_status", { action: "refresh", session_id: "session" }],
  ] as const) {
    const result = await server.call(name, arguments_);
    assert.deepEqual(result, { schema_version: 1, code: "invalid_request", message: "invalid_request", retryable: false });
  }
  assert.deepEqual(server.state(), before);
});

it("advertises closed action variants for history and status", async () => {
  const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint], cwd: process.cwd() });
  try {
    await client.connect(transport);
    const tools = new Map((await client.listTools()).tools.map((tool) => [tool.name, tool.inputSchema as unknown as { oneOf: Array<{ properties: Record<string, unknown>; required: string[]; additionalProperties: boolean }> }]));
    const history = tools.get("code_history")?.oneOf;
    const status = tools.get("code_status")?.oneOf;
    assert.equal(history?.length, 2);
    assert.equal("limit" in (history?.[0]?.properties ?? {}), false);
    assert.equal(history?.every((branch) => branch.additionalProperties === false), true);
    assert.equal(status?.length, 3);
    assert.equal("session_id" in (status?.[0]?.properties ?? {}), false);
    assert.equal("session_id" in (status?.[1]?.properties ?? {}), false);
    assert.deepEqual(status?.[2]?.required, ["action", "session_id", "request_id"]);
    assert.equal(status?.every((branch) => branch.additionalProperties === false), true);
  } finally {
    await client.close();
  }
});
