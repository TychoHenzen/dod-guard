import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";
import { callKnowledgeTool, createSyntheticKnowledgeRoot, packageRoot, removeRoot, toolText } from "./test-support.js";

const entryPoint = join(packageRoot, "dist", "bundle.js");
const sourceEntryPoint = join(packageRoot, "dist-test", "src", "index.js");
const coverageDirectory = process.env.NODE_V8_COVERAGE;
const coverageEnvironment: Record<string, string> = coverageDirectory ? { NODE_V8_COVERAGE: coverageDirectory } : {};

async function assertMalformedDocument(client: Client): Promise<void> {
  const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(toolText(result), /Invalid knowledge document/);
}

test("loads a configured synthetic corpus from an unrelated working directory", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const client = new Client({ name: "knowledge-base-entrypoint-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entryPoint],
      cwd: tmpdir(),
      env: { ...coverageEnvironment, DOD_GUARD_KNOWLEDGE_BASE_DIR: root },
    });
    try {
      await client.connect(transport);
      assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
        "knowledge_get_entry",
        "knowledge_list_chapters",
        "knowledge_list_entries",
        "knowledge_list_sections",
        "knowledge_search",
      ]);
      const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(client, "knowledge_list_chapters");
      assert.deepEqual(
        chapters.chapters.map((chapter) => chapter.key),
        ["alpha", "beta"],
      );
    } finally {
      await client.close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("runs the compiled source entrypoint with the configured synthetic root", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    const client = new Client({ name: "knowledge-base-source-entrypoint-test", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [sourceEntryPoint],
      cwd: tmpdir(),
      env: { ...coverageEnvironment, DOD_GUARD_KNOWLEDGE_BASE_DIR: root },
    });
    try {
      await client.connect(transport);
      const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(client, "knowledge_list_chapters");
      assert.deepEqual(
        chapters.chapters.map((chapter) => chapter.key),
        ["alpha", "beta"],
      );
    } finally {
      await client.close();
    }
  } finally {
    await removeRoot(root);
  }
});

test("returns an MCP error when a configured document is malformed", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  try {
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");
    await withKnowledgeBaseClient(root, "knowledge-base-error-test", assertMalformedDocument);
  } finally {
    await removeRoot(root);
  }
});
