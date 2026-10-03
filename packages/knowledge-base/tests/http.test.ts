import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startKnowledgeBaseHttpServer } from "../src/http.js";
import { createKnowledgeBaseServer } from "../src/index.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";
import { createSyntheticKnowledgeRoot, removeRoot } from "./test-support.js";

async function connected(root: string): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = await startKnowledgeBaseHttpServer({
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

test("validates the external corpus before listening and serves real HTTP MCP calls", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const server = await startKnowledgeBaseHttpServer({
      rootDir: root,
      path: "/servers/knowledge-base/mcp",
      healthPath: "/servers/knowledge-base/health",
      port: 0,
      createMcpServer: () => createKnowledgeBaseServer(root),
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
    } finally {
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

test("rejects invalid roots and public binding before accepting requests", async () => {
  const parent = await mkdtemp(join(tmpdir(), "knowledge-http-invalid-"));
  const missing = join(parent, "missing");
  try {
    await assert.rejects(
      startKnowledgeBaseHttpServer({
        rootDir: missing,
        port: 0,
        createMcpServer: () => createKnowledgeBaseServer(missing),
      }),
      /does not exist/,
    );
    const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
    try {
      await assert.rejects(
        startKnowledgeBaseHttpServer({
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
        startKnowledgeBaseHttpServer({
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
    const first = await startKnowledgeBaseHttpServer({
      rootDir: root,
      port: 0,
      createMcpServer: () => createKnowledgeBaseServer(root),
    });
    try {
      await assert.rejects(
        startKnowledgeBaseHttpServer({
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
