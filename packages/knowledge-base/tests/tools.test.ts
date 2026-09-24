import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgeBaseServer } from "../src/index.js";
import { createKnowledgeRoot, packageRoot, removeRoot } from "./test-support.js";

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

test("exposes browse, search, and retrieval tools for synthetic entries", async () => {
  const root = await createKnowledgeRoot();
  const { client, server } = await connect(root);
  try {
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
      "knowledge_get_entry",
      "knowledge_list_chapters",
      "knowledge_list_entries",
      "knowledge_list_sections",
      "knowledge_search",
    ]);

    const chapters = JSON.parse(text(await client.callTool({ name: "knowledge_list_chapters", arguments: {} }))) as {
      chapters: Array<{ key: string }>;
      next: string;
    };
    assert.deepEqual(
      chapters.chapters.map((item) => item.key),
      ["guide", "patterns"],
    );
    assert.equal(chapters.next, "knowledge_list_sections");

    const sections = JSON.parse(
      text(await client.callTool({ name: "knowledge_list_sections", arguments: { chapter: "guide" } })),
    ) as { sections: Array<{ key: string }> };
    assert.deepEqual(
      sections.sections.map((item) => item.key),
      ["guide.basics"],
    );

    const summaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "guide", section: "guide.basics" },
        }),
      ),
    ) as { entries: Array<{ key: string; content?: string }> };
    assert.deepEqual(
      summaries.entries.map((entry) => entry.key),
      ["guide.alpha", "guide.beta"],
    );
    assert.equal("content" in summaries.entries[0], false);

    const search = JSON.parse(
      text(await client.callTool({ name: "knowledge_search", arguments: { query: "choice pattern" } })),
    ) as { entries: Array<{ key: string; content?: string }> };
    assert.equal(search.entries[0]?.key, "patterns.choice");
    assert.equal("content" in search.entries[0], false);

    const full = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "guide.alpha" } })),
    ) as {
      guidance: { kind: string; executable: boolean; precedence: string };
      entry: { content: string; sources: Array<{ label: string }> };
      related: Array<{ key: string }>;
    };
    assert.equal(full.guidance.kind, "reference_guidance");
    assert.equal(full.guidance.executable, false);
    assert.match(full.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.equal(full.entry.sources[0]?.label, "synthetic fixture");
    assert.equal(full.entry.content, "Alpha fixture content.");
    assert.deepEqual(full.related.map((entry) => entry.key), ["guide.beta"]);
  } finally {
    await client.close();
    await server.close();
    await removeRoot(root);
  }
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
