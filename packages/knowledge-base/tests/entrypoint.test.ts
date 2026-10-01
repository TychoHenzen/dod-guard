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
import {
  callKnowledgeTool,
  knowledgeToolNames,
  packageRoot,
  toolText,
  withSyntheticKnowledgeRoot,
} from "./test-support.js";

const entryPoint = join(packageRoot, "dist", "bundle.js");
const sourceEntryPoint = join(packageRoot, "dist-test", "src", "index.js");
const coverageDirectory = process.env.NODE_V8_COVERAGE;
const coverageEnvironment: Record<string, string> = coverageDirectory ? { NODE_V8_COVERAGE: coverageDirectory } : {};

async function withStdioClient<Result>(options: {
  executable: string;
  root: string;
  name: string;
  action: (client: Client) => Promise<Result>;
}): Promise<Result> {
  const { executable, root, name, action } = options;
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable],
    cwd: tmpdir(),
    env: { ...coverageEnvironment, DOD_GUARD_KNOWLEDGE_BASE_DIR: root },
  });
  try {
    await client.connect(transport);
    return await action(client);
  } finally {
    await client.close();
  }
}

async function assertMalformedDocument(client: Client): Promise<void> {
  const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(toolText(result), /Invalid knowledge document/);
}

test("loads a configured synthetic corpus from an unrelated working directory", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, (root) =>
    withStdioClient({
      executable: entryPoint,
      root,
      name: "knowledge-base-entrypoint-test",
      action: async (client) => {
        assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), knowledgeToolNames);
        const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(
          client,
          "knowledge_list_chapters",
        );
        assert.deepEqual(
          chapters.chapters.map((chapter) => chapter.key),
          ["alpha", "beta"],
        );
      },
    }),
  ));

test("runs the compiled source entrypoint with the configured synthetic root", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, (root) =>
    withStdioClient({
      executable: sourceEntryPoint,
      root,
      name: "knowledge-base-source-entrypoint-test",
      action: async (client) => {
        const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(
          client,
          "knowledge_list_chapters",
        );
        assert.deepEqual(
          chapters.chapters.map((chapter) => chapter.key),
          ["alpha", "beta"],
        );
      },
    }),
  ));

test("returns an MCP error when a configured document is malformed", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, async (root) => {
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");
    await withKnowledgeBaseClient(root, "knowledge-base-error-test", assertMalformedDocument);
  }));
