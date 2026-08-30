import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FakeSemanticAdapter } from "./testing/fake-semantic-adapter.js";

const entryPoint = fileURLToPath(new URL("./index.js", import.meta.url));

describe("code-explorer package boundary", () => {
  it("completes initialize and tools/list through the compiled MCP process", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint] });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.deepEqual(tools.tools, []);
    } finally {
      await client.close();
    }
  });

  it("lets tests control semantic adapter readiness, results, and failures", async () => {
    const adapter = new FakeSemanticAdapter<number>();
    assert.deepEqual(adapter.readiness(), { state: "unavailable" });

    adapter.setReady();
    adapter.setResult(7);
    assert.deepEqual(adapter.readiness(), { state: "ready" });
    assert.equal(await adapter.query(), 7);

    adapter.setFailure(new Error("semantic backend stopped"));
    await assert.rejects(adapter.query(), /semantic backend stopped/);
  });
});
