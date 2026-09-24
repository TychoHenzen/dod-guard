import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { callKnowledgeTool, createKnowledgeRoot, packageRoot, removeRoot } from "./test-support.js";

async function assertFullEntry(client: Client): Promise<void> {
  const full = await callKnowledgeTool<{
    guidance: { kind: string; executable: boolean; precedence: string };
    entry: { content: string; sources: Array<{ label: string }> };
    related: Array<{ key: string }>;
  }>(client, "knowledge_get_entry", { key: "guide.alpha" });
  assert.equal(full.guidance.kind, "reference_guidance");
  assert.equal(full.guidance.executable, false);
  assert.match(full.guidance.precedence, /Explicit task and project instructions take precedence/);
  assert.equal(full.entry.sources[0]?.label, "synthetic fixture");
  assert.equal(full.entry.content, "Alpha fixture content.");
  assert.deepEqual(
    full.related.map((entry) => entry.key),
    ["guide.beta"],
  );
}

async function withSyntheticKnowledgeBase(action: (client: Client) => Promise<void>): Promise<void> {
  const root = await createKnowledgeRoot();
  try {
    await withKnowledgeBaseClient(root, "knowledge-base-test", action);
  } finally {
    await removeRoot(root);
  }
}

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
    ["guide", "patterns"],
  );
  assert.equal(chapters.next, "knowledge_list_sections");

  const sections = await callKnowledgeTool<{ sections: Array<{ key: string }> }>(client, "knowledge_list_sections", {
    chapter: "guide",
  });
  assert.deepEqual(
    sections.sections.map((item) => item.key),
    ["guide.basics"],
  );

  const summaries = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_list_entries",
    { chapter: "guide", section: "guide.basics" },
  );
  assert.deepEqual(
    summaries.entries.map((entry) => entry.key),
    ["guide.alpha", "guide.beta"],
  );
  assert.equal("content" in summaries.entries[0], false);

  const search = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_search",
    {
      query: "choice pattern",
    },
  );
  assert.equal(search.entries[0]?.key, "patterns.choice");
  assert.equal("content" in search.entries[0], false);

  await assertFullEntry(client);
}

test("exposes browse, search, and retrieval tools for synthetic entries", async () => {
  await withSyntheticKnowledgeBase(assertToolSurface);
});

test("keeps the package independent from retired storage and executable policy", () => {
  const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8")) as {
    description?: string;
    dependencies?: Record<string, string>;
  };
  assert.match(packageJson.description ?? "", /locally configured Markdown knowledge base/);
  assert.equal(packageJson.dependencies?.["obsidian-rag"], undefined);
  const source = ["schema.ts", "store.ts", "tools.ts", "index.ts"]
    .map((file) => readFileSync(`${packageRoot}/src/${file}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /obsidian-rag|child_process|execFile|spawn\(/u);
});
