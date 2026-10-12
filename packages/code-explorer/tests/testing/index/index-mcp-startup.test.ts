import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createServer, toMcpToolResult } from "../../../src/index.js";
import { isolatedServerTransport } from "./index-test-stdio-client.js";

const entryPoint = fileURLToPath(
  new URL("../../../src/index.js", import.meta.url),
);

it("completes initialize and tools/list through compiled process", async () => {
  const { transport, dispose } = isolatedServerTransport(
    "code-explorer-startup-",
  );
  const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
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
    await client.close().finally(dispose);
  }
});

it("gives each advertised tool its own description", async () => {
  const { transport, dispose } = isolatedServerTransport(
    "code-explorer-startup-",
  );
  const client = new Client({
    name: "code-explorer-metadata-test",
    version: "1.0.0",
  });
  try {
    await client.connect(transport);
    const descriptions = (await client.listTools()).tools.map(
      ({ description }) => description,
    );
    assert.equal(new Set(descriptions).size, 5);
    assert.ok(
      descriptions.every(
        (description) => description && description.length > 30,
      ),
    );
  } finally {
    await client.close().finally(dispose);
  }
});

it(
  "returns success envelopes through structuredContent and matching JSON " +
    "text",
  async () => {
    const result = await createServer().call("code_status", {
      action: "start_session",
    });
    assert.equal("code" in result, false);
    const response = toMcpToolResult(result);
    assert.deepEqual(
      response.structuredContent,
      JSON.parse(response.content[0]?.text ?? ""),
    );
  },
);

it(
  "uses an explicit startup root and redacts invalid root paths in the " +
    "compiled child",
  async () => {
    const { transport, dispose } = isolatedServerTransport(
      "code-explorer-startup-",
      ["--project-root", process.cwd()],
    );
    const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      assert.equal((await client.listTools()).tools.length, 5);
    } finally {
      await client.close().finally(dispose);
    }
    const invalid = spawnSync(
      process.execPath,
      [entryPoint, "--project-root", "missing-project-root"],
      { encoding: "utf8" },
    );
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /invalid_project_root:project_root/);
    assert.equal(invalid.stderr.includes("missing-project-root"), false);
  },
);

it("advertises exactly the five read-only navigation tools", async () => {
  const { transport, dispose } = isolatedServerTransport(
    "code-explorer-startup-",
  );
  const client = new Client({ name: "code-explorer-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    assert.deepEqual(names.sort(), [
      "code_focus",
      "code_follow",
      "code_history",
      "code_search",
      "code_status",
    ]);
    assert.equal(
      names.some((name) => /rename|create|update|delete/.test(name)),
      false,
    );
  } finally {
    await client.close().finally(dispose);
  }
});
