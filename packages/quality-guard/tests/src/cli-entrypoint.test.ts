import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  let connected = false;
  await runQualityGuardCli(["check", "--staged"], {
    createServer: () => {
      connected = true;
      return {} as McpServer;
    },
    startHttp: async () => {
      throw new Error("HTTP should not start");
    },
  });
  assert.equal(connected, false);

  const publicOutput = await captureStdout(() =>
    runQualityGuardCli(
      ["check", "--committed", "HEAD", "--json"],
      cliDependencies(),
    ),
  );
  assert.equal(JSON.parse(publicOutput).status, "advisory");

  const root = fixture();
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalInternalFlag =
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
  try {
    writeFileSync(
      join(root, "packages", "fixture", "src", "change.ts"),
      "export class Change {}\n",
    );
    git(root, ["add", "packages/fixture/src/change.ts"]);
    git(root, ["commit", "-m", "change"]);
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = "1";
    process.chdir(root);
    const internalOutput = await captureStdout(() =>
      runQualityGuardCli(
        ["check", "--committed", "HEAD", "--json"],
        cliDependencies(),
      ),
    );
    const internalResult = JSON.parse(internalOutput);
    assert.notEqual(internalResult.status, "advisory");
    assert.ok(internalResult.verdict);
  } finally {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    if (originalInternalFlag === undefined)
      delete process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
    else
      process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = originalInternalFlag;
    rmSync(root, { recursive: true, force: true });
  }
});
