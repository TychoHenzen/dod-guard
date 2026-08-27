import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../mcp-tools.js";

const MANUAL_TASK = [
  "## 1. Setup",
  "",
  "- [ ] 1.1 A task",
  "<!-- status: pending -->",
  "<!-- manual_required: true -->",
];

describe("task-guard integration via MCP", () => {
  let cwd: string;
  let server: McpServer;
  let client: Client;

  before(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "guard-integration-"));
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

  it("rejects when the guard file is corrupted", async () => {
    const dir = path.join(cwd, "openspec", "changes", "corrupted");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "tasks.md"), MANUAL_TASK.join("\n"), "utf-8");
    await fs.writeFile(path.join(dir, ".task-guard.json"), '{"v":1,"tasks":{},"hmac":"forged"}', "utf-8");

    const r = await client.callTool({ name: "complete", arguments: { cwd, changeId: "corrupted", taskId: "1.1" } });
    const p = JSON.parse((r.content as Array<{ text: string }>)[0].text);
    assert.equal(p.rejected, true);
    assert.ok(p.errors.includes("corrupted"));
  });

  it("reverts a task checked outside the gate", async () => {
    const dir = path.join(cwd, "openspec", "changes", "tamper");
    await fs.mkdir(dir, { recursive: true });
    const tasks = [...MANUAL_TASK, "", "- [ ] 1.2 Other", "<!-- status: pending -->", "<!-- manual_required: true -->"];
    const content = `${tasks.join("\n")}\n`;
    await fs.writeFile(path.join(dir, "tasks.md"), content, "utf-8");

    await client.callTool({ name: "lock", arguments: { cwd, changeId: "tamper" } });
    await fs.writeFile(path.join(dir, "tasks.md"), content.replace("[ ] 1.2", "[x] 1.2"), "utf-8");

    const r = await client.callTool({ name: "complete", arguments: { cwd, changeId: "tamper", taskId: "1.1" } });
    const p = JSON.parse((r.content as Array<{ text: string }>)[0].text);
    assert.equal(p.passed, true);
    assert.ok(p.errors.includes("REVERTED"));

    const final = await fs.readFile(path.join(dir, "tasks.md"), "utf-8");
    assert.ok(final.includes("[ ] 1.2"));
    assert.ok(final.includes("[x] 1.1"));
  });
});
