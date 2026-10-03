import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { installHttpSignalHandlers } from "../../src/http.js";
import { startQualityGuardHttpServer } from "../../src/index.js";

function fixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `quality-http-${name}-`));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", `${name}.ts`), `export const ${name} = 1;\n`);
  return root;
}

async function withClient<Result>(
  action: (client: Client) => Promise<Result>,
): Promise<Result> {
  const server = await startQualityGuardHttpServer({
    path: "/mcp",
    healthPath: "/health",
    port: 0,
  });
  const client = new Client({ name: "quality-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${server.port}${server.path}`),
    {
      reconnectionOptions: {
        initialReconnectionDelay: 1,
        maxReconnectionDelay: 1,
        reconnectionDelayGrowFactor: 1,
        maxRetries: 0,
      },
    },
  );
  try {
    await client.connect(transport);
    return await action(client);
  } finally {
    await client.close();
    await server.close();
  }
}

test("serves health and MCP initialization over Streamable HTTP", async () => {
  const server = await startQualityGuardHttpServer({
    path: "/servers/quality-guard/mcp",
    healthPath: "/servers/quality-guard/health",
    port: 0,
  });
  try {
    const health = await fetch(
      `http://127.0.0.1:${server.port}${server.healthPath}`,
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      service: "quality-guard",
      status: "ready",
      endpoint: "/servers/quality-guard/mcp",
    });
    const client = new Client({
      name: "quality-http-init-test",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${server.port}${server.path}`),
    );
    try {
      await client.connect(transport);
      assert.deepEqual(
        (await client.listTools()).tools.map((tool) => tool.name).sort(),
        [
          "quality_commit_gate",
          "quality_gate",
          "quality_report",
          "quality_scan",
          "quality_skips",
          "quality_test_quality",
        ],
      );
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
});

test("requires a usable explicit repository root and isolates concurrent requests", async () => {
  const one = fixture("one");
  const two = fixture("two");
  try {
    await withClient(async (client) => {
      const missing = await client.callTool({
        name: "quality_scan",
        arguments: { paths: ["."] },
      });
      assert.equal(missing.isError, true);
      assert.match(JSON.stringify(missing), /root|required/i);

      const invalid = await client.callTool({
        name: "quality_scan",
        arguments: { paths: ["."], root: join(one, "missing") },
      });
      assert.match(JSON.stringify(invalid), /repository root does not exist/);

      const [first, second] = await Promise.all([
        client.callTool({
          name: "quality_scan",
          arguments: { paths: ["src"], root: one },
        }),
        client.callTool({
          name: "quality_scan",
          arguments: { paths: ["src"], root: two },
        }),
      ]);
      assert.equal(first.isError, undefined);
      assert.equal(second.isError, undefined);
      assert.match(JSON.stringify(first), /one\.ts/);
      assert.match(JSON.stringify(second), /two\.ts/);
    });
  } finally {
    rmSync(one, { recursive: true, force: true });
    rmSync(two, { recursive: true, force: true });
  }
});

test("rejects public binding and makes signal shutdown idempotent", async () => {
  await assert.rejects(
    startQualityGuardHttpServer({ host: "0.0.0.0", port: 0 }),
    /loopback-only/,
  );
  const events = new Map<string, () => void>();
  const processLike = {
    on(name: string, handler: () => void) {
      events.set(name, handler);
      return this;
    },
    off(name: string) {
      events.delete(name);
      return this;
    },
  } as unknown as NodeJS.Process;
  let closes = 0;
  const remove = installHttpSignalHandlers(
    {
      close: async () => {
        closes += 1;
      },
    },
    processLike,
  );
  events.get("SIGTERM")?.();
  events.get("SIGTERM")?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closes, 1);
  remove();
  assert.equal(events.size, 0);
});
