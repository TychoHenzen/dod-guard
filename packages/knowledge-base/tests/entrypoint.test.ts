import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import {
  callKnowledgeTool,
  createKnowledgeRoot,
  packageRoot,
  removeRoot,
  restoreKnowledgeBaseRoot,
  toolText,
} from "./test-support.js";

const entryPoint = join(packageRoot, "dist-test", "src", "index.js");
const coverageDirectory = process.env.NODE_V8_COVERAGE;
const coverageEnvironment: Record<string, string> = coverageDirectory ? { NODE_V8_COVERAGE: coverageDirectory } : {};

async function assertConfiguredRoot(client: Client): Promise<void> {
  const result = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(client, "knowledge_list_chapters");
  assert.deepEqual(
    result.chapters.map((chapter) => chapter.key),
    ["guide", "patterns"],
  );
}

async function assertEmptyRoot(client: Client): Promise<void> {
  const result = await callKnowledgeTool<{ chapters: unknown[] }>(client, "knowledge_list_chapters");
  assert.deepEqual(result.chapters, []);
}

async function assertMalformedDocument(client: Client): Promise<void> {
  const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(toolText(result), /Invalid knowledge document/);
}

test("starts the MCP stdio entrypoint and lists its tools", async () => {
  const client = new Client({ name: "knowledge-base-entrypoint-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entryPoint],
    cwd: packageRoot,
    env: coverageEnvironment,
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 5);
    assert.ok(tools.some((tool) => tool.name === "knowledge_list_chapters"));
  } finally {
    await client.close();
  }
});

test("uses the configured external root", async () => {
  const root = await createKnowledgeRoot();
  const previousRoot = process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
  process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR = root;
  try {
    await withKnowledgeBaseClient(root, "knowledge-base-configured-root-test", assertConfiguredRoot);
  } finally {
    restoreKnowledgeBaseRoot(previousRoot);
    await removeRoot(root);
  }
});

test("keeps the existing empty result for an unset root", async () => {
  const previousRoot = process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
  delete process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
  try {
    await withKnowledgeBaseClient(undefined, "knowledge-base-empty-root-test", assertEmptyRoot);
  } finally {
    restoreKnowledgeBaseRoot(previousRoot);
  }
});

test("returns an MCP error when a configured document is malformed", async () => {
  const root = await createKnowledgeRoot();
  try {
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");
    await withKnowledgeBaseClient(root, "knowledge-base-error-test", assertMalformedDocument);
  } finally {
    await removeRoot(root);
  }
});
