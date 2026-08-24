// Fixture trees used to distinguish a regular CLI workspace from a plugin.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

function write(root, relativePath, content) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export function cliWorkspaceTree() {
  const root = mkdtempSync(join(tmpdir(), "cli-workspace-"));
  write(root, "packages/fossil/package.json", JSON.stringify({ name: "fossil", version: "1.0.0" }));
  return root;
}

export function invalidPluginWorkspaceTree() {
  const root = mkdtempSync(join(tmpdir(), "invalid-plugin-workspace-"));
  write(
    root,
    "packages/broken/package.json",
    JSON.stringify({
      name: "broken",
      version: "1.0.0",
      main: "dist/bundle.js",
      repository: { directory: "packages/broken" },
    }),
  );
  write(
    root,
    "packages/broken/.claude-plugin/plugin.json",
    JSON.stringify({ name: "broken", description: "Broken plugin." }),
  );
  return root;
}
