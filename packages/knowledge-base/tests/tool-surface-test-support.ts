import assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { callKnowledgeTool, knowledgeToolNames } from "./test-support.js";

async function assertChapterNavigation(client: Client): Promise<void> {
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
  assert.deepEqual(
    sections.sections.map((section) => section.key),
    ["synthetic.topic"],
  );
}

async function assertEntryListing(client: Client): Promise<void> {
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

async function assertSearchResult(client: Client): Promise<void> {
  const search = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_search",
    { query: "synthetic full" },
  );
  assert.equal(search.entries[0]?.key, "synthetic.first");
  assert.equal("content" in search.entries[0], false);
}

async function assertEntryResult(client: Client): Promise<void> {
  const result = await callKnowledgeTool<{
    entry: { key: string; content: string };
    related: Array<{ key: string }>;
  }>(client, "knowledge_get_entry", { key: "synthetic.first" });
  assert.equal(result.entry.content, "Synthetic full content.");
  assert.deepEqual(
    result.related.map((entry) => entry.key),
    ["synthetic.second"],
  );
}

export async function assertToolSurface(client: Client): Promise<void> {
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), knowledgeToolNames);
  await assertChapterNavigation(client);
  await assertEntryListing(client);
  await assertSearchResult(client);
  await assertEntryResult(client);
}
