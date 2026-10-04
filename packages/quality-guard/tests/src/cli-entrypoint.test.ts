import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  runQualityGuardCli,
  runQualityGuardInternalCheck,
} from "../../src/cli-entrypoint.js";
import { fixture, git } from "./commit-gate/acknowledgement-test-support.js";

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

test("public committed checks stay advisory while the internal entry point runs CI replay", async () => {
  const root = fixture();
  const originalWrite = process.stdout.write;
  const originalExitCode = process.exitCode;
  const originalInternalFlag =
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
  const output: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output.push(chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  try {
    delete process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
    process.exitCode = undefined;
    await runQualityGuardCli(["check", "--committed", "HEAD", "--json"], {
      createServer: () => {
        throw new Error("public check must not start MCP");
      },
      startHttp: async () => {
        throw new Error("HTTP should not start");
      },
    });
    const publicResult = JSON.parse(output.pop() ?? "{}");
    assert.equal(publicResult.status, "advisory");

    writeFileSync(
      join(root, "packages", "fixture", "src", "change.ts"),
      "export class Change {}\n",
    );
    git(root, ["add", "packages/fixture/src/change.ts"]);
    git(root, ["commit", "-m", "change"]);
    process.exitCode = undefined;
    runQualityGuardInternalCheck(
      ["check", "--committed", "HEAD", "--json"],
      root,
    );
    const internalResult = JSON.parse(output.pop() ?? "{}");
    assert.notEqual(internalResult.status, "advisory");
    assert.ok(internalResult.verdict);
  } finally {
    process.stdout.write = originalWrite;
    process.exitCode = originalExitCode;
    if (originalInternalFlag === undefined)
      delete process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK;
    else
      process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK = originalInternalFlag;
    rmSync(root, { recursive: true, force: true });
  }
});
