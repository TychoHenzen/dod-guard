import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as stdio from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "../../index.js";

const { StdioClientTransport } = stdio;
const entryPoint = fileURLToPath(new URL("../../index.js", import.meta.url));

it(
  "returns a structured unknown-tool error without " + "changing state",
  async () => {
    const server = createServer();
    const before = server.state();
    const result = await server.call("rename", {});
    assert.deepEqual(result, {
      schema_version: 1,
      code: "unknown_tool",
      message: "unknown_tool",
      retryable: false,
    });
    assert.deepEqual(server.state(), before);
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entryPoint],
      cwd: process.cwd(),
    });
    try {
      await client.connect(transport);
      const response = (await client.callTool({
        name: "rename",
        arguments: {},
      })) as { isError?: boolean; content: Array<{ text: string }> };
      assert.equal(response.isError, true);
      assert.deepEqual(JSON.parse(response.content[0]?.text ?? ""), {
        schema_version: 1,
        code: "unknown_tool",
        message: "unknown_tool",
        retryable: false,
      });
    } finally {
      await client.close();
    }
  },
);

it(
  "returns error envelopes through structuredContent and matching JSON " +
    "text",
  async () => {
    const client = new Client({
      name: "code-explorer-structured-error-test",
      version: "1.0.0",
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entryPoint],
      cwd: process.cwd(),
    });
    try {
      await client.connect(transport);
      const response = (await client.callTool({
        name: "not_a_tool",
        arguments: {},
      })) as {
        isError?: boolean;
        structuredContent: unknown;
        content: Array<{ text: string }>;
      };
      assert.equal(response.isError, true);
      assert.deepEqual(
        response.structuredContent,
        JSON.parse(response.content[0]?.text ?? ""),
      );
    } finally {
      await client.close();
    }
  },
);
