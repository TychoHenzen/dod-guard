import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { defaultKnowledgeBaseDir } from "../src/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { callKnowledgeTool, createSyntheticKnowledgeRoot, removeRoot, toolText } from "./test-support.js";
import { syntheticStoreEntries } from "./synthetic-fixtures.js";

const environmentName = "DOD_GUARD_KNOWLEDGE_BASE_DIR";

function restoreEnvironment(value: string | undefined): void {
  if (value === undefined) delete process.env[environmentName];
  else process.env[environmentName] = value;
}

test("requires the external knowledge-base root setting", () => {
  const previous = process.env[environmentName];
  try {
    delete process.env[environmentName];
    assert.throws(
      () => defaultKnowledgeBaseDir(),
      (error: unknown) => error instanceof Error && error.message.includes(environmentName),
    );
  } finally {
    restoreEnvironment(previous);
  }
});

test("uses the configured root for the default server", async () => {
  const root = await createSyntheticKnowledgeRoot(syntheticStoreEntries);
  const previous = process.env[environmentName];
  try {
    process.env[environmentName] = root;
    await withKnowledgeBaseClient(undefined, "knowledge-base-configured-root-test", async (client) => {
      const chapters = await callKnowledgeTool<{ chapters: Array<{ key: string }> }>(
        client,
        "knowledge_list_chapters",
      );
      assert.deepEqual(
        chapters.chapters.map((chapter) => chapter.key),
        ["alpha", "beta"],
      );
    });
  } finally {
    restoreEnvironment(previous);
    await removeRoot(root);
  }
});

test("reports a missing configured root instead of returning an empty listing", async () => {
  const parent = await mkdtemp(join(tmpdir(), "knowledge-base-missing-root-"));
  const root = join(parent, "missing");
  const previous = process.env[environmentName];
  try {
    process.env[environmentName] = root;
    await withKnowledgeBaseClient(undefined, "knowledge-base-missing-root-test", async (client) => {
      const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
      assert.equal(result.isError, true);
      assert.match(toolText(result), new RegExp(environmentName));
      assert.match(toolText(result), /root.*does not exist/);
    });
  } finally {
    restoreEnvironment(previous);
    await removeRoot(parent);
  }
});

test("reports when the configured root is a file", async () => {
  const parent = await mkdtemp(join(tmpdir(), "knowledge-base-file-root-"));
  const root = join(parent, "root-file");
  await writeFile(root, "not a directory", "utf8");
  const previous = process.env[environmentName];
  try {
    process.env[environmentName] = root;
    await withKnowledgeBaseClient(undefined, "knowledge-base-file-root-test", async (client) => {
      const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
      assert.equal(result.isError, true);
      assert.match(toolText(result), /root path configured by DOD_GUARD_KNOWLEDGE_BASE_DIR is not a directory/);
    });
  } finally {
    restoreEnvironment(previous);
    await removeRoot(parent);
  }
});

test("reports when the entries path is a file", async () => {
  const root = await mkdtemp(join(tmpdir(), "knowledge-base-file-entries-"));
  await writeFile(join(root, "entries"), "not a directory", "utf8");
  try {
    await withKnowledgeBaseClient(root, "knowledge-base-file-entries-test", async (client) => {
      const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
      assert.equal(result.isError, true);
      assert.match(toolText(result), /entries path configured by DOD_GUARD_KNOWLEDGE_BASE_DIR is not a directory/);
    });
  } finally {
    await removeRoot(root);
  }
});
