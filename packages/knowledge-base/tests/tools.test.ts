import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withKnowledgeBaseClient } from "./mcp-test-support.js";
import { syntheticToolEntries } from "./synthetic-fixtures.js";
import {
  callKnowledgeTool,
  packageRoot,
  toolText,
  withSyntheticKnowledgeRoot,
  withTemporaryDirectory,
} from "./test-support.js";
import { assertToolSurface } from "./tool-surface-test-support.js";

async function assertMissingRoot(client: Client): Promise<void> {
  const result = await client.callTool({ name: "knowledge_list_chapters", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(toolText(result), /DOD_GUARD_KNOWLEDGE_BASE_DIR/);
  assert.match(toolText(result), /root.*does not exist/);
}

test("exposes five read tools for a synthetic root", () =>
  withSyntheticKnowledgeRoot(syntheticToolEntries, (root) =>
    withKnowledgeBaseClient(root, "knowledge-base-test", assertToolSurface),
  ));

test("returns an MCP error when the configured root is missing", () =>
  withTemporaryDirectory("knowledge-base-tools-missing-", (parent) =>
    withKnowledgeBaseClient(join(parent, "missing"), "knowledge-base-missing-root-test", assertMissingRoot),
  ));

test("keeps the package independent from retired storage and executable policy", () => {
  const packageJson = JSON.parse(readFileSync(`${packageRoot}/package.json`, "utf8")) as {
    description?: string;
    dependencies?: Record<string, string>;
  };
  assert.match(packageJson.description ?? "", /Read-only retrieval/);
  assert.equal(packageJson.dependencies?.["obsidian-rag"], undefined);
  const source = ["schema.ts", "store.ts", "tools.ts", "index.ts"]
    .map((file) => readFileSync(`${packageRoot}/src/${file}`, "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /obsidian-rag|child_process|execFile|spawn\(/u);
});
