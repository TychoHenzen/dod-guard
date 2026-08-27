import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./mcp-tools.js";

describe("registerTools", () => {
  it("registers cover and complete on the server", async () => {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    registerTools(server);

    const client = new Client({ name: "probe", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ["complete", "cover", "lock"]);

    await client.close();
    await server.close();
  });
});

describe("complete tool via MCP", () => {
  let cwd: string;
  let server: McpServer;
  let client: Client;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-mcp-complete-"));
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerTools(server);
    client = new Client({ name: "probe", version: "0.0.0" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
  });

  after(async () => {
    await client.close();
    await server.close();
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("returns a usage error when tasks.md does not exist", async () => {
    const result = await client.callTool({
      name: "complete",
      arguments: { cwd, changeId: "no-such-change", taskId: "1.1" },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    assert.equal(parsed.passed, false);
    assert.equal(parsed.exitCode, 3);
  });

  it("marks a manual task complete", async () => {
    const changeDir = path.join(cwd, "openspec", "changes", "test-change");
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, "tasks.md"),
      [
        "## 1. Setup",
        "",
        "- [ ] 1.1 Manual step",
        "<!-- status: pending -->",
        "<!-- manual_required: true -->",
        "",
      ].join("\n"),
    );

    const result = await client.callTool({
      name: "complete",
      arguments: { cwd, changeId: "test-change", taskId: "1.1" },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    assert.equal(parsed.passed, true);
    assert.equal(parsed.exitCode, 0);
  });
});
