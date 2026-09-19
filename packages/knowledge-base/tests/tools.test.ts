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
      ["clean-code", "design-patterns", "refactoring", "ux-ui-design"],
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

    const cleanCodeSections = JSON.parse(
      text(await client.callTool({ name: "knowledge_list_sections", arguments: { chapter: "clean-code" } })),
    );
    assert.deepEqual(
      cleanCodeSections.sections.map((item: { key: string }) => item.key),
      [
        "clean-code.comments",
        "clean-code.formatting",
        "clean-code.foundation",
        "clean-code.functions",
        "clean-code.meaningful-names",
      ],
    );

    const cleanCodeSummaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "clean-code", section: "clean-code.foundation" },
        }),
      ),
    );
    assert.equal(cleanCodeSummaries.entries[0].key, "clean-code.clean-code");
    assert.equal("content" in cleanCodeSummaries.entries[0], false);

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

    const cleanCode = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "clean-code.clean-code" } })),
    );
    assert.equal(cleanCode.guidance.kind, "reference_guidance");
    assert.equal(cleanCode.guidance.executable, false);
    assert.match(cleanCode.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.match(cleanCode.entry.sources[0].label, /PDF pages 33-47/);
    assert.match(cleanCode.entry.content, /Boy Scout rule/);

    const meaningfulNamesSummaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "clean-code", section: "clean-code.meaningful-names" },
        }),
      ),
    );
    assert.equal(meaningfulNamesSummaries.entries[0].key, "clean-code.meaningful-names");
    assert.match(meaningfulNamesSummaries.entries[0].summary, /intent|context|concept/);
    assert.equal("content" in meaningfulNamesSummaries.entries[0], false);

    const meaningfulNames = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "clean-code.meaningful-names" } })),
    );
    assert.equal(meaningfulNames.guidance.kind, "reference_guidance");
    assert.equal(meaningfulNames.guidance.executable, false);
    assert.match(meaningfulNames.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.match(meaningfulNames.entry.sources[0].label, /PDF pages 48-61/);
    assert.match(meaningfulNames.entry.content, /pronounceable/);

    const functionsSummaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "clean-code", section: "clean-code.functions" },
        }),
      ),
    );
    assert.equal(functionsSummaries.entries[0].key, "clean-code.functions");
    assert.match(functionsSummaries.entries[0].summary, /small|focused|story/);
    assert.equal("content" in functionsSummaries.entries[0], false);

    const functions = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "clean-code.functions" } })),
    );
    assert.equal(functions.guidance.kind, "reference_guidance");
    assert.equal(functions.guidance.executable, false);
    assert.match(functions.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.match(functions.entry.sources[0].label, /PDF pages 62-83/);
    assert.match(functions.entry.content, /side effects/);

    const commentsSummaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "clean-code", section: "clean-code.comments" },
        }),
      ),
    );
    assert.equal(commentsSummaries.entries[0].key, "clean-code.comments");
    assert.match(commentsSummaries.entries[0].summary, /expressive|accurate|purposeful/);
    assert.equal("content" in commentsSummaries.entries[0], false);

    const comments = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "clean-code.comments" } })),
    );
    assert.equal(comments.guidance.kind, "reference_guidance");
    assert.equal(comments.guidance.executable, false);
    assert.match(comments.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.match(comments.entry.sources[0].label, /PDF pages 84-105/);
    assert.match(comments.entry.content, /commented-out code/);
    assert.match(comments.entry.content, /Javadocs for public APIs/);

    const formattingSummaries = JSON.parse(
      text(
        await client.callTool({
          name: "knowledge_list_entries",
          arguments: { chapter: "clean-code", section: "clean-code.formatting" },
        }),
      ),
    );
    assert.equal(formattingSummaries.entries[0].key, "clean-code.formatting");
    assert.match(formattingSummaries.entries[0].summary, /readable|structure|spacing/);
    assert.equal("content" in formattingSummaries.entries[0], false);

    const formatting = JSON.parse(
      text(await client.callTool({ name: "knowledge_get_entry", arguments: { key: "clean-code.formatting" } })),
    );
    assert.equal(formatting.guidance.kind, "reference_guidance");
    assert.equal(formatting.guidance.executable, false);
    assert.match(formatting.guidance.precedence, /Explicit task and project instructions take precedence/);
    assert.match(formatting.entry.sources[0].label, /PDF pages 106-123/);
    assert.match(formatting.entry.content, /Indentation/);

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
