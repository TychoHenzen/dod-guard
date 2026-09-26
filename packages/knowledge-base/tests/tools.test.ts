import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { callKnowledgeTool, packageRoot, shippedKnowledgeRoot } from "./test-support.js";

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
