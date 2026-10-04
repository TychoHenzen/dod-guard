import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  installHttpSignalHandlers,
  normalizeHttpPath,
  parseHttpCliOptions,
  type RunningHttpServer,
  startMcpHttpServer,
} from "../../src/http.js";
import { startQualityGuardHttpServer } from "../../src/index.js";

function fixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `quality-http-${name}-`));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", `${name}.ts`), `export const ${name} = 1;\n`);
  return root;
}

async function readRawResponse(
  response: IncomingMessage,
): Promise<{ status: number; body: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.from(chunk));
  return {
    status: response.statusCode ?? 0,
    body: Buffer.concat(chunks).toString("utf8"),
  };
}

async function rawHttpRequest(url: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(url, { headers });
    request.on("response", (response) => {
      void readRawResponse(response).then(resolve, reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function forbiddenHeaderStatuses(url: string): Promise<number[]> {
  const hostileHost = await rawHttpRequest(url, { host: "attacker.example" });
  const hostileOrigin = await fetch(url, {
    headers: { origin: "http://attacker.example" },
  });
  return [hostileHost.status, hostileOrigin.status];
}

function rejectingMcpFactory(onCall: () => unknown, message: string) {
  return () => {
    onCall();
    throw new Error(message);
  };
}

async function assertHostileLoopbackHeaders(
  url: string,
  factoryCount: () => number,
): Promise<void> {
  assert.deepEqual(await forbiddenHeaderStatuses(url), [403, 403]);
  assert.equal(factoryCount(), 0);
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

function createDrainMcpServer(
  released: Promise<void>,
  started: () => void,
): McpServer {
  const server = new McpServer({ name: "drain-test", version: "1.0.0" });
  server.tool("slow", async () => {
    started();
    await released;
    return { content: [{ type: "text", text: "finished" }] };
  });
  return server;
}

async function createDrainServer() {
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const server = await startMcpHttpServer({
    path: "/mcp",
    port: 0,
    serviceName: "quality-guard",
    createMcpServer: () => createDrainMcpServer(released, signalStarted),
  });
  return { server, release, started };
}

async function completeDrainRequest(
  server: RunningHttpServer,
  release: () => void,
  started: Promise<void>,
): Promise<void> {
  const client = new Client({ name: "drain-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${server.port}${server.path}`),
  );
  try {
    await client.connect(transport);
    const resultPromise = client.callTool({ name: "slow", arguments: {} });
    await started;
    let closed = false;
    const closePromise = server.close().then(() => {
      closed = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(closed, false);
    release();
    const result = await resultPromise;
    assert.match(JSON.stringify(result), /finished/);
    await client.close();
    await closePromise;
  } finally {
    await client.close().catch(() => undefined);
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
        ["quality_report", "quality_scan", "quality_test_quality"],
      );
      const missingRoute = await fetch(
        `http://127.0.0.1:${server.port}/missing`,
      );
      assert.equal(missingRoute.status, 404);
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
    await server.close();
  }
});

test("rejects hostile loopback headers before MCP dispatch", async () => {
  const factories = { count: 0 };
  const server = await startMcpHttpServer({
    path: "/mcp",
    healthPath: "/health",
    port: 0,
    serviceName: "quality-guard",
    createMcpServer: rejectingMcpFactory(
      () => (factories.count += 1),
      "the factory must not run for hostile headers",
    ),
  });
  try {
    await assertHostileLoopbackHeaders(
      `http://127.0.0.1:${server.port}${server.path}`,
      () => factories.count,
    );
  } finally {
    await server.close();
  }
});

test("normalizes a large trailing-slash suffix without a backtracking regex", () => {
  assert.equal(normalizeHttpPath(`/mcp${"/".repeat(200_000)}`), "/mcp");
});

test("drains an in-flight MCP request before closing the HTTP server", async () => {
  const { server, release, started } = await createDrainServer();
  try {
    await completeDrainRequest(server, release, started);
  } finally {
    release();
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

      const fileRoot = await fixture("file-root");
      try {
        const filePath = join(fileRoot, "src", "file-root.ts");
        const fileResult = await client.callTool({
          name: "quality_report",
          arguments: { root: filePath },
        });
        assert.match(
          JSON.stringify(fileResult),
          /repository root is not a directory/,
        );
      } finally {
        rmSync(fileRoot, { recursive: true, force: true });
      }
      const report = await client.callTool({
        name: "quality_report",
        arguments: { root: one },
      });
      assert.equal(report.isError, undefined);
      const testQuality = await client.callTool({
        name: "quality_test_quality",
        arguments: { root: one },
      });
      assert.equal(testQuality.isError, undefined);

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

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const failingEvents = new Map<string, () => void>();
  const removeFailing = installHttpSignalHandlers(
    {
      close: async () => {
        throw "close failed";
      },
    },
    {
      on(name: string, handler: () => void) {
        failingEvents.set(name, handler);
        return this;
      },
      off(name: string) {
        failingEvents.delete(name);
        return this;
      },
    } as unknown as NodeJS.Process,
  );
  failingEvents.get("SIGTERM")?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(process.exitCode, 1);
  process.exitCode = previousExitCode;
  removeFailing();

  const removeError = installHttpSignalHandlers(
    {
      close: async () => {
        throw new Error("close failed");
      },
    },
    processLike,
  );
  events.get("SIGTERM")?.();
  await new Promise((resolve) => setImmediate(resolve));
  removeError();
  process.exitCode = previousExitCode;
});

test("validates HTTP options and turns request setup failures into 500 responses", async () => {
  await assert.rejects(
    startQualityGuardHttpServer({ port: -1 }),
    /between 0 and 65535/,
  );
  await assert.rejects(
    startQualityGuardHttpServer({ path: "relative" }),
    /absolute URL path/,
  );
  await assert.rejects(
    startQualityGuardHttpServer({ healthPath: "/health?bad=true" }),
    /absolute URL path/,
  );
  const rootPathServer = await startQualityGuardHttpServer({
    path: "/",
    port: 0,
  });
  await fetch(`http://127.0.0.1:${rootPathServer.port}${rootPathServer.path}`);
  await rootPathServer.close();

  let requests = 0;
  const server = await startMcpHttpServer({
    serviceName: "quality-guard",
    path: "/mcp",
    port: 0,
    createMcpServer: () => {
      if (requests++ === 0) throw new Error("factory failed");
      throw "factory failed";
    },
  });
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.port}${server.path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(response.status, 500);
    assert.match(await response.text(), /factory failed/);
    const stringResponse = await fetch(
      `http://127.0.0.1:${server.port}${server.path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    assert.equal(stringResponse.status, 500);
    assert.match(await stringResponse.text(), /factory failed/);
  } finally {
    await server.close();
  }
});

test("reports a conflicting HTTP port without leaving the first service open", async () => {
  const first = await startMcpHttpServer({
    serviceName: "quality-guard",
    port: 0,
    createMcpServer: () => {
      throw new Error("unused");
    },
  });
  try {
    await assert.rejects(
      startMcpHttpServer({
        serviceName: "quality-guard",
        port: first.port,
        createMcpServer: () => {
          throw new Error("unused");
        },
      }),
      /failed to bind.*EADDRINUSE/,
    );
  } finally {
    await first.close();
  }
});

test("parses CLI overrides before environment defaults", () => {
  assert.deepEqual(
    parseHttpCliOptions(
      ["--port=21999", "--path=/cli", "--health-path=/cli-health"],
      { MCP_HOST_BIND_HOST: "localhost", MCP_HOST_PORT: "21998" },
    ),
    {
      host: "localhost",
      port: 21_999,
      path: "/cli",
      healthPath: "/cli-health",
    },
  );
  assert.deepEqual(parseHttpCliOptions([], {}), {
    host: "127.0.0.1",
    port: 21_720,
    path: "/mcp",
    healthPath: "/health",
  });
});
