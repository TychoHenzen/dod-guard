import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "./index.js";
import { FakeSemanticAdapter } from "./testing/fake-semantic-adapter.js";

const entryPoint = fileURLToPath(new URL("./index.js", import.meta.url));

describe("code-explorer package boundary", () => {
  it("completes initialize and tools/list through the compiled MCP process", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint] });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
        "code_focus",
        "code_follow",
        "code_history",
        "code_search",
        "code_status",
      ]);
    } finally {
      await client.close();
    }
  });

  // covers: code-explorer/mcp-navigation :: The MCP surface stays small and workspace-read-only :: Client lists Code Explorer tools
  it("advertises exactly the five read-only navigation tools", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint] });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      assert.deepEqual(names.sort(), ["code_focus", "code_follow", "code_history", "code_search", "code_status"]);
      assert.equal(
        names.some((name) => /rename|create|update|delete/.test(name)),
        false,
      );
    } finally {
      await client.close();
    }
  });

  // covers: code-explorer/mcp-navigation :: The MCP surface stays small and workspace-read-only :: Client requests an unknown tool
  it("returns a structured unknown-tool error without changing state", async () => {
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
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint] });
    try {
      await client.connect(transport);
      const response = (await client.callTool({ name: "rename", arguments: {} })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
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
  });

  // covers: code-explorer/mcp-navigation :: The MCP surface stays small and workspace-read-only :: Client refreshes derived state
  it("refreshes only derived state and preserves view history", async () => {
    const server = createServer();
    const before = server.state();
    const result = await server.call("code_status", {
      action: "refresh",
      session_id: "session",
      request_id: "request",
    });

    assert.equal("code" in result, false);
    if ("code" in result) throw new Error("expected a successful refresh");
    assert.equal(result.state, "refreshed");
    assert.equal(server.state().refresh_generation, before.refresh_generation + 1);
    assert.deepEqual(server.state().view_history, before.view_history);
  });

  // covers: code-explorer/mcp-navigation :: MCP tool schemas are closed and versioned :: Tool input contains an unknown field
  it("rejects unknown and action-mismatched fields before state work", async () => {
    const server = createServer();
    const before = server.state();

    for (const [name, arguments_] of [
      ["code_search", { query: "helper", unexpected: true }],
      ["code_focus", { session_id: "session", request_id: "request", symbol_id: "symbol", limit: 1 }],
      [
        "code_follow",
        {
          session_id: "session",
          request_id: "request",
          view_id: "view",
          handle: "handle",
          relation: "definition",
          extra: 1,
        },
      ],
      ["code_history", { session_id: "session", request_id: "request", action: "back", limit: 1 }],
      ["code_status", { action: "status", session_id: "session" }],
      ["code_status", { action: "refresh", session_id: "session" }],
    ] as const) {
      const result = await server.call(name, arguments_);
      assert.deepEqual(result, {
        schema_version: 1,
        code: "invalid_request",
        message: "invalid_request",
        retryable: false,
      });
    }

    assert.deepEqual(server.state(), before);
  });

  it("advertises closed action variants for history and status", async () => {
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [entryPoint] });

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      const schemas = new Map(
        tools.map((tool) => [
          tool.name,
          tool.inputSchema as unknown as {
            oneOf: Array<{ properties: Record<string, unknown>; required: string[]; additionalProperties: boolean }>;
          },
        ]),
      );
      const history = schemas.get("code_history")?.oneOf;
      const status = schemas.get("code_status")?.oneOf;

      assert.equal(history?.length, 2);
      assert.equal("limit" in (history?.[0]?.properties ?? {}), false);
      assert.equal(
        history?.every((branch) => branch.additionalProperties === false),
        true,
      );
      assert.equal(status?.length, 3);
      assert.equal("session_id" in (status?.[0]?.properties ?? {}), false);
      assert.equal("session_id" in (status?.[1]?.properties ?? {}), false);
      assert.deepEqual(status?.[2]?.required, ["action", "session_id", "request_id"]);
      assert.equal(
        status?.every((branch) => branch.additionalProperties === false),
        true,
      );
    } finally {
      await client.close();
    }
  });

  // covers: code-explorer/mcp-navigation :: MCP tool schemas are closed and versioned :: Successful tool response uses the common envelope
  it("returns only the common versioned envelope for every successful tool", async () => {
    const server = createServer();
    const calls: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["code_search", { query: "helper" }],
      ["code_focus", { session_id: "session", request_id: "request", symbol_id: "symbol" }],
      [
        "code_follow",
        { session_id: "session", request_id: "request", view_id: "view", handle: "handle", relation: "definition" },
      ],
      ["code_history", { session_id: "session", request_id: "request", action: "recent", limit: 1 }],
      ["code_status", { action: "status" }],
    ];

    for (const [name, arguments_] of calls) {
      const result = await server.call(name, arguments_);
      assert.equal("code" in result, false);
      if ("code" in result) throw new Error(`${name} unexpectedly failed`);
      assert.deepEqual(Object.keys(result).sort(), [
        "data",
        "pending_generation",
        "project_generation",
        "project_id",
        "schema_version",
        "state",
      ]);
      assert.equal(result.schema_version, 1);
      assert.equal(typeof result.project_id, "string");
      assert.equal(typeof result.project_generation, "number");
      assert.equal(result.pending_generation, null);
    }
  });

  // covers: code-explorer/mcp-navigation :: MCP tool schemas are closed and versioned :: Backend reports an unsupported operation
  it("makes an unsupported relation explicit instead of returning an empty result array", async () => {
    const server = createServer();
    for (const relation of ["definition", "references", "callers", "callees", "type", "implementation"]) {
      const result = await server.call("code_follow", {
        session_id: "session",
        request_id: "request",
        view_id: "view",
        handle: "handle",
        relation,
      });

      assert.equal("code" in result, false);
      if ("code" in result) throw new Error("expected an unavailable relation result");
      assert.equal(result.state, "unavailable_relation");
      assert.deepEqual(result.data, { relation });
      assert.equal(Array.isArray((result.data as Record<string, unknown>).results), false);
    }
  });

  it("lets tests control semantic adapter readiness, results, and failures", async () => {
    const adapter = new FakeSemanticAdapter<number>();
    assert.deepEqual(adapter.readiness(), { state: "unavailable" });

    adapter.setReady();
    adapter.setResult(7);
    assert.deepEqual(adapter.readiness(), { state: "ready" });
    assert.equal(await adapter.query(), 7);

    adapter.setFailure(new Error("semantic backend stopped"));
    await assert.rejects(adapter.query(), /semantic backend stopped/);
  });
});
