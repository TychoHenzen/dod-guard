import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { syntheticToolEntries } from "./synthetic-fixtures.js";
import { callKnowledgeTool, createSyntheticKnowledgeRoot, removeRoot, toolText } from "./test-support.js";

async function assertBrowse(client: Client): Promise<void> {
  const sections = await callKnowledgeTool<{ sections: Array<{ key: string }> }>(client, "knowledge_list_sections", {
    chapter: "synthetic",
  });
  assert.deepEqual(
    sections.sections.map((section) => section.key),
    ["synthetic.topic"],
  );
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
}

async function assertRetrieval(client: Client): Promise<void> {
  const emptySearch = await callKnowledgeTool<{ entries: unknown[] }>(client, "knowledge_search", { query: "   " });
  assert.deepEqual(emptySearch.entries, []);
  const full = await callKnowledgeTool<{
    entry: { key: string; content: string };
    related: Array<{ key: string }>;
  }>(client, "knowledge_get_entry", { key: "synthetic.first" });
  assert.equal(full.entry.content, "Synthetic full content.");
  assert.deepEqual(
    full.related.map((entry) => entry.key),
    ["synthetic.second"],
  );
}

async function assertErrors(client: Client): Promise<void> {
  const invalidSection = await client.callTool({
    name: "knowledge_list_sections",
    arguments: { chapter: "not a key" },
  });
  assert.equal(invalidSection.isError, true);
  assert.match(toolText(invalidSection), /stable hierarchy key/);
  const missingEntry = await client.callTool({
    name: "knowledge_get_entry",
    arguments: { key: "synthetic.missing" },
  });
  assert.equal(missingEntry.isError, true);
  assert.match(toolText(missingEntry), /knowledge entry not found/);
}

test("serves an explicit synthetic root through every browse and retrieval tool", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticToolEntries);
  const emptyRoot = await createSyntheticKnowledgeRoot({});
  try {
    await withKnowledgeBaseClient(root, "knowledge-base-synthetic-test", async (client) => {
      await assertBrowse(client);
      await assertRetrieval(client);
      await assertErrors(client);
    });
    await withKnowledgeBaseClient(emptyRoot, "knowledge-base-empty-test", async (client) => {
      const chapters = await callKnowledgeTool<{ chapters: unknown[] }>(client, "knowledge_list_chapters");
      assert.deepEqual(chapters.chapters, []);
    });
  } finally {
    await removeRoot(root);
    await removeRoot(emptyRoot);
  }
});
