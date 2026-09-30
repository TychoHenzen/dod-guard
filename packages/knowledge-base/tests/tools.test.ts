import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { syntheticToolEntries } from "./synthetic-fixtures.js";
import {
  callKnowledgeTool,
  createSyntheticKnowledgeRoot,
  packageRoot,
  removeRoot,
  toolText,
} from "./test-support.js";

async function assertToolSurface(client: Client): Promise<void> {
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
    "knowledge_get_entry",
    "knowledge_list_chapters",
    "knowledge_list_entries",
    "knowledge_list_sections",
    "knowledge_search",
  ]);

  const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }>; next: string }>(
    client,
    "knowledge_list_chapters",
  );
  assert.deepEqual(
    chapters.chapters.map((item) => item.key),
    ["synthetic"],
  );
  assert.equal(chapters.next, "knowledge_list_sections");

  const sections = await callKnowledgeTool<{ sections: Array<{ key: string }> }>(client, "knowledge_list_sections", {
    chapter: "synthetic",
  });
  assert.deepEqual(sections.sections.map((section) => section.key), ["synthetic.topic"]);

  const entries = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_list_entries",
    { chapter: "synthetic", section: "synthetic.topic" },
  );
  assert.deepEqual(
    entries.entries.map((entry) => entry.key),
    ["synthetic.first", "synthetic.second"],
  );
  assert.equal("content" in entries.entries[0], false);

  const search = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_search",
    {
      query: "synthetic full",
    },
  );
  assert.equal(search.entries[0]?.key, "synthetic.first");
  assert.equal("content" in search.entries[0], false);

  const result = await callKnowledgeTool<{
    entry: { key: string; content: string };
    related: Array<{ key: string }>;
  }>(client, "knowledge_get_entry", { key: "synthetic.first" });
  assert.equal(result.entry.content, "Synthetic full content.");
  assert.deepEqual(result.related.map((entry) => entry.key), ["synthetic.second"]);
}

test("exposes five read tools for a synthetic root", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticToolEntries);
  try {
    await withKnowledgeBaseClient(root, "knowledge-base-test", assertToolSurface);
  } finally {
    await removeRoot(root);
  }
});

test("returns an MCP error when the configured root is missing", async () => {
  const parent = await mkdtemp(join(tmpdir(), "knowledge-base-tools-missing-"));
  try {
    await withKnowledgeBaseClient(join(parent, "missing"), "knowledge-base-missing-root-test", async (client) => {
      const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
      assert.equal(result.isError, true);
      assert.match(toolText(result), /DOD_GUARD_KNOWLEDGE_BASE_DIR/);
      assert.match(toolText(result), /root.*does not exist/);
    });
  } finally {
    await removeRoot(parent);
  }
});

test("keeps the package independent from retired storage and executable policy", () => {
  const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8")) as {
    description?: string;
    dependencies?: Record<string, string>;
  };
  assert.match(packageJson.description ?? "", /Read-only retrieval/);
  assert.equal(packageJson.dependencies?.["obsidian-rag"], undefined);
  const source = ["schema.ts", "store.ts", "tools.ts", "index.ts"]
    .map((file) => readFileSync(`${packageRoot}/src/${file}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /obsidian-rag|child_process|execFile|spawn\(/u);
});
