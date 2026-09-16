import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgeBaseServer } from "../src/index.js";
import { exampleRoot, packageRoot, removeRoot } from "./test-support.js";

function text(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.[0]?.type === "text" ? (content[0].text ?? "") : "";
}

async function connect(root: string) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createKnowledgeBaseServer(root);
  await server.connect(serverTransport);
  const client = new Client({ name: "knowledge-base-test", version: "1.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

test("exposes progressive browse, search, full retrieval, and refinement tools", async () => {
  const root = await exampleRoot();
  const { client, server } = await connect(root);
  try {
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
      "knowledge_get_entry",
      "knowledge_list_chapters",
      "knowledge_list_entries",
      "knowledge_list_sections",
      "knowledge_save",
      "knowledge_search",
    ]);

    const chapters = JSON.parse(text(await client.callTool({ name: "knowledge_list_chapters", arguments: {} })));
    assert.deepEqual(
      chapters.chapters.map((item: { key: string }) => item.key),
      ["design-patterns", "refactoring", "ux-ui-design"],
    );
    assert.equal(chapters.next, "knowledge_list_sections");
    assert.doesNotMatch(JSON.stringify(chapters), /Move behavior/);

    const sections = JSON.parse(
      text(await client.callTool({ name: "knowledge_list_sections", arguments: { chapter: "refactoring" } })),
    );
    assert.deepEqual(
      sections.sections.map((item: { key: string }) => item.key),
      ["refactoring.method-movement"],
    );

    const summaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "refactoring", section: "refactoring.method-movement" },
        }),
      ),
    );
    assert.equal(summaries.entries[0].key, "refactoring.move-method");
    assert.equal("content" in summaries.entries[0], false);

    const search = JSON.parse(
      text(await client.callTool({ name: "knowledge_search", arguments: { query: "C# strategy" } })),
    );
    assert.equal(search.entries[0].key, "design-patterns.strategy");
    assert.equal("content" in search.entries[0], false);

    const full = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "design-patterns.strategy" } })),
    );
    assert.equal(full.guidance.kind, "reference_guidance");
    assert.equal(full.guidance.executable, false);
    assert.match(full.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.equal(full.entry.sources[0].project, "spatial-wires");
    assert.match(full.entry.content, /Strategy/);

    const saved = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_save",
          arguments: {
            key: "ux-ui-design.focus-order",
            title: "Focus Order",
            chapter: "ux-ui-design",
            section: "ux-ui-design.accessibility",
            summary: "Keep keyboard focus order predictable.",
            content: "Check focus order with a keyboard.",
            sources: [{ label: "test source", project: "BeeHAIve", language: "Python" }],
          },
        }),
      ),
    );
    assert.equal(saved.saved.historyEntries, 0);

    const refined = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_save",
          arguments: {
            key: "ux-ui-design.focus-order",
            content: "Check focus order with keyboard and screen reader paths.",
            reason: "added accessibility verification",
          },
        }),
      ),
    );
    assert.equal(refined.saved.historyEntries, 1);
  } finally {
    await client.close();
    await server.close();
    await removeRoot(root);
  }
});

test("keeps the package independent from retired storage and executable policy", () => {
  const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(packageJson.dependencies?.["obsidian-rag"], undefined);
  const source = ["schema.ts", "store.ts", "tools.ts", "index.ts"]
    .map((file) => readFileSync(`${packageRoot}/src/${file}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /obsidian-rag|child_process|execFile|spawn\(/u);
});
