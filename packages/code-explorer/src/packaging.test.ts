import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("browser packaging", () => {
  it("ships the browser shell and same-origin assets beside the bundle", () => {
    for (const asset of ["index.html", "client.js", "style.css"]) {
      assert.equal(
        existsSync(path.join(packageRoot, "dist", "browser", asset)),
        true,
        `missing browser asset ${asset}`,
      );
    }
    const shell = readFileSync(path.join(packageRoot, "dist", "browser", "index.html"), "utf8");
    assert.match(shell, /src="\/client\.js"/);
    assert.match(shell, /href="\/style\.css"/);
  });
  it("ships a Codex manifest that exposes the packaged MCP server", () => {
    const manifest = JSON.parse(readFileSync(path.join(packageRoot, ".codex-plugin", "plugin.json"), "utf8"));
    assert.equal(manifest.name, "code-explorer");
    assert.equal(manifest.mcpServers?.["code-explorer"]?.command, "node");
    assert.deepEqual(manifest.mcpServers?.["code-explorer"]?.args, ["dist/bundle.js"]);
    assert.equal(manifest.mcpServers?.["code-explorer"]?.cwd, ".");
  });
});
