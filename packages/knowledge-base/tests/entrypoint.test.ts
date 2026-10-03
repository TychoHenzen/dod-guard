import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { runKnowledgeBaseCli } from "../src/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";
import {
  callKnowledgeTool,
  knowledgeToolNames,
  packageRoot,
  toolText,
  withSyntheticKnowledgeRoot,
} from "./test-support.js";

const entryPoint = join(packageRoot, "dist", "bundle.js");
const sourceEntryPoint = join(packageRoot, "dist-test", "src", "index.js");
const coverageDirectory = process.env.NODE_V8_COVERAGE;
const coverageEnvironment: Record<string, string> = coverageDirectory ? { NODE_V8_COVERAGE: coverageDirectory } : {};

async function withStdioClient<Result>(options: {
  executable: string;
  root: string;
  name: string;
  action: (client: Client) => Promise<Result>;
}): Promise<Result> {
  const { executable, root, name, action } = options;
  const client = new Client({ name, version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [executable],
    cwd: tmpdir(),
    env: { ...coverageEnvironment, DOD_GUARD_KNOWLEDGE_BASE_DIR: root },
  });
  try {
    await client.connect(transport);
    return await action(client);
  } finally {
    await client.close();
  }
}

async function assertMalformedDocument(client: Client): Promise<void> {
  const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(toolText(result), /Invalid knowledge document/);
}

test("loads a configured synthetic corpus from an unrelated working directory", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, (root) =>
    withStdioClient({
      executable: entryPoint,
      root,
      name: "knowledge-base-entrypoint-test",
      action: async (client) => {
        assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), knowledgeToolNames);
        const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(
          client,
          "knowledge_list_chapters",
        );
        assert.deepEqual(
          chapters.chapters.map((chapter) => chapter.key),
          ["alpha", "beta"],
        );
      },
    }),
  ));

test("runs the compiled source entrypoint with the configured synthetic root", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, (root) =>
    withStdioClient({
      executable: sourceEntryPoint,
      root,
      name: "knowledge-base-source-entrypoint-test",
      action: async (client) => {
        const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(
          client,
          "knowledge_list_chapters",
        );
        assert.deepEqual(
          chapters.chapters.map((chapter) => chapter.key),
          ["alpha", "beta"],
        );
      },
    }),
  ));

test("runs the source entrypoint as a hosted HTTP service", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, async (root) => {
    const child = spawn(process.execPath, [sourceEntryPoint, "--http", "--port=0"], {
      cwd: tmpdir(),
      env: { ...coverageEnvironment, DOD_GUARD_KNOWLEDGE_BASE_DIR: root },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let output = "";
    const ready = new Promise<string>((resolve, reject) => {
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/HTTP ready at (http:\/\/[^\s]+)/u);
        if (match) resolve(match[1]);
      });
      child.once("error", reject);
    });
    try {
      const address = await ready;
      const health = await fetch(`${address.replace(/\/mcp$/u, "")}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), {
        service: "knowledge-base",
        status: "ready",
        endpoint: "/mcp",
        root,
      });
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
  }));

test("runs the hosted HTTP branch through the in-process entrypoint", async () => {
  await withSyntheticKnowledgeRoot(syntheticStoreEntries, async (root) => {
    const previousRoot = process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
    process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR = root;
    const running = await runKnowledgeBaseCli(["--http", "--port=0"]);
    assert.ok(running);
    try {
      const health = await fetch(`http://${running.host}:${running.port}${running.healthPath}`);
      assert.equal(health.status, 200);
    } finally {
      await running.close();
      if (previousRoot === undefined) delete process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR;
      else process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR = previousRoot;
    }
  });
});

test("reports a missing HTTP corpus root from the source entrypoint", async () => {
  const child = spawn(process.execPath, [sourceEntryPoint, "--http"], {
    cwd: tmpdir(),
    env: coverageEnvironment,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const [code] = await new Promise<[number | null]>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve([exitCode]));
  });
  assert.equal(code, 1);
  assert.match(output, /DOD_GUARD_KNOWLEDGE_BASE_DIR must be set/);
});

test("does not run an imported entrypoint when its main path cannot be resolved", async () => {
  const originalArgument = process.argv[1];
  process.argv[1] = join(tmpdir(), "missing-knowledge-base-entrypoint.js");
  try {
    await import(`../src/index.js?main-check=${Date.now()}`);
    process.argv[1] = undefined as never;
    await import(`../src/index.js?main-check-empty=${Date.now()}`);
  } finally {
    process.argv[1] = originalArgument;
  }
});

test("returns an MCP error when a configured document is malformed", () =>
  withSyntheticKnowledgeRoot(syntheticStoreEntries, async (root) => {
    await writeFile(join(root, "entries", "broken.md"), "missing front matter", "utf8");
    await withKnowledgeBaseClient(root, "knowledge-base-error-test", assertMalformedDocument);
  }));
