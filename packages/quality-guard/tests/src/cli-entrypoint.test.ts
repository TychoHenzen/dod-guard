import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runQualityGuardCli } from "../../src/cli-entrypoint.js";
import { fixture, git } from "./commit-gate/acknowledgement-test-support.js";

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

test("public checks stay advisory while internal committed checks replay CI", async () => {
  const stagedOutput = await captureStdout(() =>
    runQualityGuardCli(["check", "--staged"], cliDependencies()),
  );
  assert.equal(JSON.parse(stagedOutput).status, "advisory");
  const publicOutput = await committedCheck();
  assert.equal(JSON.parse(publicOutput).status, "advisory");
  const root = fixture();
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalInternalFlag =
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
  try {
    git(root, ["commit", "--allow-empty", "-m", "change"]);
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = "1";
    process.chdir(root);
    const internalOutput = await committedCheck();
    const internalResult = JSON.parse(internalOutput);
    assert.notEqual(internalResult.status, "advisory");
    assert.ok(internalResult.verdict);
  } finally {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    if (originalInternalFlag === undefined)
      delete process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
    if (originalInternalFlag !== undefined)
      process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = originalInternalFlag;
    rmSync(root, { recursive: true, force: true });
  }
});
