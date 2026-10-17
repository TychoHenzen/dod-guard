import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repository = resolve(import.meta.dirname, "..", "..", "..", "..");

const paths = [
  "packages/quality-guard/package.json",
  "packages/quality-guard/.claude-plugin/plugin.json",
  "packages/quality-guard/.codex-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
];

const documents = new Map(
  await Promise.all(
    paths.map(async (path) => [
      path,
      await readFile(resolve(repository, path), "utf8"),
    ]),
  ),
);

test("quality-guard manifests expose only advisory documentation", () => {
  const packageJson = JSON.parse(
    documents.get("packages/quality-guard/package.json"),
  );
  const claudeManifest = JSON.parse(
    documents.get("packages/quality-guard/.claude-plugin/plugin.json"),
  );
  const codexManifest = JSON.parse(
    documents.get("packages/quality-guard/.codex-plugin/plugin.json"),
  );
  const marketplace = JSON.parse(
    documents.get(".claude-plugin/marketplace.json"),
  );
  const marketplaceEntry = marketplace.plugins.find(
    (plugin) => plugin.name === "quality-guard",
  );

  for (const description of [
    packageJson.description,
    claudeManifest.description,
    codexManifest.description,
    codexManifest.interface.longDescription,
    marketplaceEntry.description,
  ]) {
    assert.match(description, /advisory/i);
  }
  assert.match(codexManifest.interface.defaultPrompt[0], /advisory/i);
  assert.deepEqual(codexManifest.interface.capabilities, [
    "MCP tools",
    "Skills",
  ]);
});
