import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runQualityGuardCli } from "../../src/cli-entrypoint.js";

test("no command still starts the normal MCP server", async () => {
  let connected = false;
  await runQualityGuardCli([], {
    createServer: () =>
      ({
        connect: async () => {
          connected = true;
        },
      }) as unknown as McpServer,
    startHttp: async () => {
      throw new Error("HTTP should not start");
    },
  });
  assert.equal(connected, true);
});

test("retired decision commands return advisory output without starting MCP", async () => {
  let connected = false;
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await runQualityGuardCli(["check", "--staged"], {
      createServer: () => {
        connected = true;
        return {} as McpServer;
      },
      startHttp: async () => {
        throw new Error("HTTP should not start");
      },
    });
  } finally {
    process.stdout.write = originalWrite;
  }
  const result = JSON.parse(output);
  assert.equal(result.status, "advisory");
  assert.equal(result.command, "check");
  assert.equal(connected, false);
});
