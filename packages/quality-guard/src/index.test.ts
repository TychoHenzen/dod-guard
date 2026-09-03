import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runStagedCheck } from "./commit-gate/cli.js";
import { createQualityGuardServer, text, toolError } from "./index.js";

test("text wraps a payload in the MCP content shape", () => {
  assert.deepEqual(text("hello"), { content: [{ type: "text", text: "hello" }] });
});

test("toolError reports an Error message without leaking a stack", () => {
  const result = toolError(new Error("baseline not found"));
  assert.equal(result.content[0].text, "ERROR: baseline not found");
});

test("toolError stringifies a non-Error throw", () => {
  assert.equal(toolError("plain string").content[0].text, "ERROR: plain string");
});

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function stagedFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-mcp-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(path.join(root, ".github", "quality"), { recursive: true });
  writeFileSync(path.join(root, "source.ts"), "export class Existing {}\n");
  writeFileSync(
    path.join(root, ".github", "quality", "quality-baseline.json"),
    '{"version":2,"profile":"default","total":0,"counts":{},"files":["source.ts"]}\n',
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  writeFileSync(path.join(root, "source.ts"), "export class Existing { public added(): void {} }\n");
  git(root, ["add", "source.ts"]);
  return root;
}

async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createQualityGuardServer();
  await server.connect(serverTransport);
  const client = new Client({ name: "quality-guard-test", version: "1.0.0" });
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function resultText(result: unknown): string {
  const content = (result as { content?: unknown }).content as Array<{ type: string; text?: string }> | undefined;
  return content?.[0]?.type === "text" ? (content[0].text ?? "") : "";
}
test("the MCP server lists scan, baseline, waiver, and commit-gate tools", async () => {
  const connection = await connect();
  try {
    const tools = await connection.client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      "quality_commit_gate",
      "quality_gate",
      "quality_report",
      "quality_scan",
      "quality_skips",
    ]);
    assert.equal(
      tools.tools.every((tool) => Boolean(tool.description)),
      true,
    );
  } finally {
    await connection.close();
  }
});
test("the MCP commit-gate tool returns the staged decision JSON", async () => {
  const root = stagedFixture();
  const connection = await connect();
  try {
    const result = await connection.client.callTool({ name: "quality_commit_gate", arguments: { root } });
    const decision = JSON.parse(resultText(result));
    const cli = runStagedCheck(root, { json: true, intent: "change" });
    assert.match(decision.verdict, /^(PASS|REVIEW_REQUIRED|FAIL)$/);
    assert.equal(typeof decision.fingerprint, "string");
    assert.equal(Array.isArray(decision.findings), true);
    assert.equal(decision.verdict, cli.verdict);
    assert.equal(decision.fingerprint, cli.fingerprint);
    assert.deepEqual(
      decision.findings.map((finding: { id: string }) => finding.id),
      cli.findings.map((finding) => finding.id),
    );
  } finally {
    await connection.close();
    rmSync(root, { recursive: true, force: true });
  }
});
test("the MCP commit-gate tool returns a concise refactor usage error", async () => {
  const connection = await connect();
  try {
    const result = await connection.client.callTool({
      name: "quality_commit_gate",
      arguments: { root: process.cwd(), intent: "refactor" },
    });
    const output = resultText(result);
    assert.match(output, /^ERROR: .*requires.*target/i);
    assert.equal(output.includes("at "), false);
  } finally {
    await connection.close();
  }
});
