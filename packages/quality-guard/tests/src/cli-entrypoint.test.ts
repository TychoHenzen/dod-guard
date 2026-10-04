import assert from "node:assert/strict";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runQualityGuardCli } from "../../src/cli-entrypoint.js";

async function captureStdout(action: () => Promise<void>) {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await action();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}

function cliDependencies() {
  return {
    createServer: () => {
      throw new Error("public check must not start MCP");
    },
    startHttp: async () => {
      throw new Error("HTTP should not start");
    },
  } satisfies Parameters<typeof runQualityGuardCli>[1];
}

function committedCheck() {
  return captureStdout(() =>
    runQualityGuardCli(
      ["check", "--committed", "HEAD", "--json"],
      cliDependencies(),
    ),
  );
}

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

test("public checks stay advisory", async () => {
  const stagedOutput = await captureStdout(() =>
    runQualityGuardCli(["check", "--staged"], cliDependencies()),
  );
  assert.equal(JSON.parse(stagedOutput).status, "advisory");
  const publicOutput = await committedCheck();
  assert.equal(JSON.parse(publicOutput).status, "advisory");
});

test("legacy internal flags cannot restore a decision path", async () => {
  const originalInternal = process.env.QUALITY_GUARD_INTERNAL_CHECK;
  const originalCommitted = process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
  try {
    process.env.QUALITY_GUARD_INTERNAL_CHECK = "1";
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = "1";
    const output = await captureStdout(() =>
      runQualityGuardCli(
        ["check", "--committed", "HEAD", "--json"],
        cliDependencies(),
      ),
    );
    assert.equal(JSON.parse(output).status, "advisory");
  } finally {
    delete process.env.QUALITY_GUARD_INTERNAL_CHECK;
    if (originalInternal !== undefined)
      process.env.QUALITY_GUARD_INTERNAL_CHECK = originalInternal;
    delete process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
    if (originalCommitted !== undefined)
      process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = originalCommitted;
  }
});
