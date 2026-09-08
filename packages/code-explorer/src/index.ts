import { realpathSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { BrowserServerError } from "./browser-server/lifecycle.js";
import { createRuntimeCoreFactory } from "./runtime-core.js";
import { createEmbeddedBrowserRuntime, runMain } from "./runtime-main.js";
import { ProjectPathError } from "./semantic/api/public-api.js";

export type EmbeddedBrowserRuntime =
  import("./browser-server/embedded-runtime.js").EmbeddedBrowserRuntime;
export type { CodeExplorerError } from "./navigation/error.js";
export { createServer } from "./server/create-server.js";
export type { CodeExplorerEnvelope } from "./server/envelope.js";
export type { CodeExplorerServer } from "./server/server-contract.js";
export type { CodeExplorerState } from "./server/state.js";
export { toMcpToolResult } from "./server/tool-result.js";
export { createEmbeddedBrowserRuntime, createRuntimeCoreFactory };

const filename = fileURLToPath(import.meta.url);

function isMainModule(): boolean {
  const argument = process.argv[1];
  if (!argument) return false;
  try {
    return realpathSync(argument) === realpathSync(filename);
  } catch {
    return argument === filename;
  }
}

if (isMainModule()) {
  runMain().catch((error) => {
    const message =
      error instanceof ProjectPathError
        ? `${error.code}:${error.root_source ?? "cwd"}`
        : error instanceof BrowserServerError
          ? error.code
          : String(error);
    process.stderr.write(`code-explorer MCP server failed: ${message}\n`);
    process.exit(1);
  });
}
