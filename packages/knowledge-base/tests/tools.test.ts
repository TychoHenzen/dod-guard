import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { callKnowledgeTool, cleanCodeSectionKeys, packageRoot, shippedKnowledgeRoot } from "./test-support.js";

async function assertFullEntry(client: Client): Promise<void> {
  const full = await callKnowledgeTool<{
    guidance: { kind: string; executable: boolean; precedence: string };
    entry: { content: string; sources: Array<{ label: string }> };
    related: Array<{ key: string }>;
  }>(client, "knowledge_get_entry", { key: "clean-code.clean-code" });
  assert.equal(full.guidance.kind, "reference_guidance");
  assert.equal(full.guidance.executable, false);
  assert.match(full.guidance.precedence, /Explicit task and project instructions take precedence/);
  assert.match(full.entry.sources[0]?.label ?? "", /PDF pages 33-47/);
  assert.match(full.entry.content, /executable detail of a requirement/);
  assert.deepEqual(full.related, []);
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
    ["clean-code", "design-patterns", "refactoring", "ux-ui-design"],
  );
  assert.equal(chapters.next, "knowledge_list_sections");

  const sections = await callKnowledgeTool<{ sections: Array<{ key: string }> }>(client, "knowledge_list_sections", {
    chapter: "clean-code",
  });
  assert.deepEqual(
    sections.sections.map((item) => item.key),
    cleanCodeSectionKeys,
  );

  const summaries = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_list_entries",
    { chapter: "clean-code", section: "clean-code.foundation" },
  );
  assert.deepEqual(
    summaries.entries.map((entry) => entry.key),
    ["clean-code.clean-code"],
  );
  assert.equal("content" in summaries.entries[0], false);

  const search = await callKnowledgeTool<{ entries: Array<{ key: string; content?: string }> }>(
    client,
    "knowledge_search",
    {
      query: "C# strategy",
    },
  );
  assert.equal(search.entries[0]?.key, "design-patterns.strategy");
  assert.equal("content" in search.entries[0], false);

  await assertFullEntry(client);
}

test("exposes browse, search, and retrieval tools for shipped entries", async () => {
  await withKnowledgeBaseClient(shippedKnowledgeRoot, "knowledge-base-test", assertToolSurface);
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
