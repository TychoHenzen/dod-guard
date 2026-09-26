import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import {
  callKnowledgeTool,
  createSyntheticKnowledgeRoot,
  packageRoot,
  removeRoot,
  shippedKnowledgeRoot,
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
    ["design-patterns", "refactoring", "ux-ui-design"],
  );
  assert.equal(chapters.next, "knowledge_list_sections");

  const search = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_search",
    {
      query: "C# strategy",
    },
  );
  assert.equal(search.entries[0]?.key, "design-patterns.strategy");
  assert.equal("content" in search.entries[0], false);
}

test("exposes browse, search, and retrieval tools for shipped entries", async () => {
  await withKnowledgeBaseClient(shippedKnowledgeRoot, "knowledge-base-test", assertToolSurface);
});

test("serves an explicit synthetic root through every browse and retrieval tool", async () => {
  const root = await createSyntheticKnowledgeRoot({
    "synthetic/first.md": [
      "---",
      "key: synthetic.first",
      "title: First synthetic entry",
      "chapter: synthetic",
      "section: synthetic.topic",
      "summary: Synthetic summary",
      "sources:",
      "  - label: fixture",
      "related_keys:",
      "  - synthetic.second",
      "---",
      "Synthetic full content.",
    ].join("\n"),
    "synthetic/second.md": [
      "---",
      "key: synthetic.second",
      "title: Second synthetic entry",
      "chapter: synthetic",
      "section: synthetic.topic",
      "summary: Related synthetic summary",
      "sources:",
      "  - label: fixture",
      "---",
      "Related full content.",
    ].join("\n"),
  });
  const emptyRoot = await createSyntheticKnowledgeRoot({});
  try {
    await withKnowledgeBaseClient(root, "knowledge-base-synthetic-test", async (client) => {
      const sections = await callKnowledgeTool<{ sections: Array<{ key: string }> }>(
        client,
        "knowledge_list_sections",
        { chapter: "synthetic" },
      );
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
      const emptySearch = await callKnowledgeTool<{ entries: unknown[] }>(client, "knowledge_search", {
        query: "   ",
      });
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

test("keeps the package independent from retired storage and executable policy", () => {
  const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8")) as {
    description?: string;
    dependencies?: Record<string, string>;
  };
  assert.match(packageJson.description ?? "", /repository-authored Markdown corpus shipped/);
  assert.equal(packageJson.dependencies?.["obsidian-rag"], undefined);
  const source = ["schema.ts", "store.ts", "tools.ts", "index.ts"]
    .map((file) => readFileSync(`${packageRoot}/src/${file}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /obsidian-rag|child_process|execFile|spawn\(/u);
});
