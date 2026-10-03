import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  installKnowledgeHttpSignals,
  normalizeHttpPath,
  parseKnowledgeHttpCliOptions,
  startKnowledgeBaseHttpServer as startKnowledgeBaseHttpService,
} from "../src/http.js";
import { createKnowledgeBaseServer, startKnowledgeBaseHttpServer } from "../src/index.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";
import { createSyntheticKnowledgeRoot, removeRoot } from "./test-support.js";

async function connected(root: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = await startKnowledgeBaseHttpService({
    rootDir: root,
    path: "/mcp",
    healthPath: "/health",
    port: 0,
    createMcpServer: () => createKnowledgeBaseServer(root),
  });
  const client = new Client({ name: "knowledge-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}${server.path}`), {
    reconnectionOptions: {
      initialReconnectionDelay: 1,
      maxReconnectionDelay: 1,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  });
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

async function rawHttpRequest(url: string, headers: Record<string, string>) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpRequest(url, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

test("validates the external corpus before listening and serves real HTTP MCP calls", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const server = await startKnowledgeBaseHttpServer({
      rootDir: root,
      path: "/servers/knowledge-base/mcp",
      healthPath: "/servers/knowledge-base/health",
      port: 0,
    });
    try {
      const health = await fetch(`http://127.0.0.1:${server.port}${server.healthPath}`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), {
        service: "knowledge-base",
        status: "ready",
        endpoint: "/servers/knowledge-base/mcp",
        root,
      });
      const client = new Client({ name: "knowledge-http-entrypoint-test", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}${server.path}`));
      try {
        await client.connect(transport);
        const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
        assert.equal(result.isError, undefined);
        assert.match(JSON.stringify(result), /alpha/);
      } finally {
        await client.close();
      }
      const missingRoute = await fetch(`http://127.0.0.1:${server.port}/missing`);
      assert.equal(missingRoute.status, 404);
    } finally {
      await server.close();
      await server.close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("keeps the configured corpus root fixed across concurrent HTTP clients", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const { client, close } = await connected(root);
    try {
      const results = await Promise.all([
        client.callTool({ name: "knowledge_list_chapters", arguments: {} }),
        client.callTool({ name: "knowledge_search", arguments: { query: "alpha" } }),
      ]);
      assert.ok(results.every((result) => result.isError === undefined));
      assert.match(JSON.stringify(results[0]), /alpha/);
      assert.match(JSON.stringify(results[1]), /alpha/);
    } finally {
      await close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("rejects hostile loopback headers before knowledge dispatch", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  let factories = 0;
  try {
    const server = await startKnowledgeBaseHttpService({
      rootDir: root,
      path: "/mcp",
      port: 0,
      createMcpServer: () => {
        factories += 1;
        throw new Error("the factory must not run for hostile headers");
      },
    });
    try {
      const hostileHost = await rawHttpRequest(`http://127.0.0.1:${server.port}${server.path}`, {
        host: "attacker.example",
      });
      assert.equal(hostileHost.status, 403);
      const hostileOrigin = await fetch(`http://127.0.0.1:${server.port}${server.path}`, {
        headers: { origin: "http://attacker.example" },
      });
      assert.equal(hostileOrigin.status, 403);
      assert.equal(factories, 0);
    } finally {
      await server.close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("normalizes a large trailing-slash suffix without a backtracking regex", () => {
  assert.equal(normalizeHttpPath(`/mcp${"/".repeat(200_000)}`), "/mcp");
});

test("rejects invalid roots and public binding before accepting requests", async () => {
  const parent = await mkdtemp(join(tmpdir(), "knowledge-http-invalid-"));
  const missing = join(parent, "missing");
  try {
    await assert.rejects(
      startKnowledgeBaseHttpService({
        rootDir: missing,
        port: 0,
        createMcpServer: () => createKnowledgeBaseServer(missing),
      }),
      /does not exist/,
    );
    const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
    try {
      await assert.rejects(
        startKnowledgeBaseHttpService({
          rootDir: root,
          host: "0.0.0.0",
          port: 0,
          createMcpServer: () => createKnowledgeBaseServer(root),
        }),
        /loopback-only/,
      );
    } finally {
      await removeRoot(root);
    }

    const malformedRoot = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
    try {
      await writeFile(join(malformedRoot, "entries", "broken.md"), "not a knowledge document", "utf8");
      await assert.rejects(
        startKnowledgeBaseHttpService({
          rootDir: malformedRoot,
          port: 0,
          createMcpServer: () => createKnowledgeBaseServer(malformedRoot),
        }),
        /Invalid knowledge document entries\/broken\.md/,
      );
    } finally {
      await removeRoot(malformedRoot);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("rejects a conflicting port before exposing a second service", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const first = await startKnowledgeBaseHttpService({
      rootDir: root,
      port: 0,
      createMcpServer: () => createKnowledgeBaseServer(root),
    });
    try {
      await assert.rejects(
        startKnowledgeBaseHttpService({
          rootDir: root,
          port: first.port,
          createMcpServer: () => createKnowledgeBaseServer(root),
        }),
        /failed to bind.*EADDRINUSE/,
      );
    } finally {
      await first.close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("validates HTTP options and turns request setup failures into 500 responses", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    await assert.rejects(
      startKnowledgeBaseHttpService({
        rootDir: root,
        port: -1,
        createMcpServer: () => createKnowledgeBaseServer(root),
      }),
      /between 0 and 65535/,
    );
    await assert.rejects(
      startKnowledgeBaseHttpService({
        rootDir: root,
        path: "relative",
        createMcpServer: () => createKnowledgeBaseServer(root),
      }),
      /absolute URL path/,
    );
    await assert.rejects(
      startKnowledgeBaseHttpService({
        rootDir: root,
        healthPath: "/health?bad=true",
        createMcpServer: () => createKnowledgeBaseServer(root),
      }),
      /absolute URL path/,
    );
    const rootPathServer = await startKnowledgeBaseHttpService({
      rootDir: root,
      path: "/",
      port: 0,
      createMcpServer: () => createKnowledgeBaseServer(root),
    });
    await fetch(`http://127.0.0.1:${rootPathServer.port}${rootPathServer.path}`);
    await rootPathServer.close();

    let requests = 0;
    const server = await startKnowledgeBaseHttpService({
      rootDir: root,
      path: "/mcp",
      port: 0,
      createMcpServer: () => {
        if (requests++ === 0) throw new Error("factory failed");
        throw "factory failed";
      },
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}${server.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 500);
      assert.match(await response.text(), /factory failed/);
      const stringResponse = await fetch(`http://127.0.0.1:${server.port}${server.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(stringResponse.status, 500);
      assert.match(await stringResponse.text(), /factory failed/);
    } finally {
      await server.close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("parses CLI overrides and shuts down once for repeated signals", async () => {
  assert.deepEqual(
    parseKnowledgeHttpCliOptions(["--port=21999", "--path=/cli", "--health-path=/cli-health"], {
      MCP_HOST_BIND_HOST: "localhost",
      MCP_HOST_PORT: "21998",
    }),
    {
      host: "localhost",
      port: 21_999,
      path: "/cli",
      healthPath: "/cli-health",
    },
  );
  assert.deepEqual(parseKnowledgeHttpCliOptions([], {}), {
    host: "127.0.0.1",
    port: 21_721,
    path: "/mcp",
    healthPath: "/health",
  });
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
  const remove = installKnowledgeHttpSignals(
    {
      close: async () => {
        closes += 1;
      },
    },
    processLike,
  );
  events.get("SIGINT")?.();
  events.get("SIGINT")?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closes, 1);
  remove();
  assert.equal(events.size, 0);

  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const failingEvents = new Map<string, () => void>();
  const removeFailing = installKnowledgeHttpSignals(
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

  const removeError = installKnowledgeHttpSignals(
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
