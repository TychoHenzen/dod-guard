import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgeBaseServer } from "../src/index.js";
import { createKnowledgeRoot, packageRoot, removeRoot } from "./test-support.js";

const entryPoint = join(packageRoot, "dist-test", "src", "index.js");
const coverageDirectory = process.env.NODE_V8_COVERAGE;
const coverageEnvironment: Record<string, string> = coverageDirectory ? { NODE_V8_COVERAGE: coverageDirectory } : {};

function text(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.[0]?.type === "text" ? (content[0].text ?? "") : "";
}

test("starts the MCP stdio entrypoint and lists its tools", async () => {
  const client = new Client({ name: "knowledge-base-entrypoint-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entryPoint],
    cwd: packageRoot,
    env: coverageEnvironment,
  });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 5);
    assert.ok(tools.some((tool) => tool.name === "knowledge_list_chapters"));
  } finally {
    await client.close();
  }
});

test("uses the configured external root", async () => {
  const root = await createKnowledgeRoot();
  const previousRoot = process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
  process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR = root;
  const server = createKnowledgeBaseServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "knowledge-base-configured-root-test", version: "1.0.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = JSON.parse(text(await client.callTool({ name: "knowledge_list_chapters", arguments: {} }))) as {
      chapters: Array<{ key: string }>;
    };
    assert.deepEqual(
      result.chapters.map((chapter) => chapter.key),
      ["guide", "patterns"],
    );
  } finally {
    await client.close();
    await server.close();
    if (previousRoot === undefined) delete process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
    else process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR = previousRoot;
    await removeRoot(root);
  }
});

test("keeps the existing empty result for an unset root", async () => {
  const previousRoot = process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
  delete process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
  const server = createKnowledgeBaseServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "knowledge-base-empty-root-test", version: "1.0.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = JSON.parse(text(await client.callTool({ name: "knowledge_list_chapters", arguments: {} }))) as {
      chapters: unknown[];
    };
    assert.deepEqual(result.chapters, []);
  } finally {
    await client.close();
    await server.close();
    if (previousRoot === undefined) delete process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
    else process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR = previousRoot;
  }
});

test("returns an MCP error when a configured document is malformed", async () => {
  const root = await createKnowledgeRoot();
  try {
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createKnowledgeBaseServer(root);
    const client = new Client({ name: "knowledge-base-error-test", version: "1.0.0" });
    await server.connect(serverTransport);
    try {
      await client.connect(clientTransport);
      const result = (await client.callTool({ name: "knowledge_list_chapters", arguments: {} })) as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };
      assert.equal(result.isError, true);
      const errorText = result.content?.find((item) => item.type === "text")?.text ?? "";
      assert.match(errorText, /Invalid knowledge document/);
    } finally {
      await client.close();
      await server.close();
    }
  } finally {
    await removeRoot(root);
  }
});
