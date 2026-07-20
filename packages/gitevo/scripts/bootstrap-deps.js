// bootstrap-deps.js — ensures native dependencies are installed in plugin cache
//
// The plugin system copies files from git but does not run npm install.
// better-sqlite3 is a native module excluded from esbuild bundle,
// so it must be installed in node_modules.
//
// This script runs on SessionStart via plugin.json hooks.
// Fast path: if better-sqlite3 is already installed, exits immediately.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const bs3Path = join(pluginRoot, "node_modules", "better-sqlite3");

if (!existsSync(bs3Path)) {
  console.error(`[gitevo] Installing native dependencies...`);
  try {
    execSync("npm install --omit=dev --no-audit --no-fund", {
      cwd: pluginRoot,
      stdio: "pipe",
      timeout: 60000,
    });
    console.error(`[gitevo] Dependencies installed.`);
  } catch (err) {
    console.error(`[gitevo] Failed to install dependencies: ${err.message}`);
    // Don't block startup — MCP server will fail with a clearer error
  }
} else {
  console.error(`[gitevo] Dependencies already present, skipping install.`);
}
