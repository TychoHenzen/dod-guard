import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as stdio from "@modelcontextprotocol/sdk/client/stdio.js";
import { removeTemporaryTree } from "./index-test-fake-backend.js";
import { isolatedDiscoveryEnvironment } from "./index-test-isolated-env.js";

const { StdioClientTransport, getDefaultEnvironment } = stdio;
const entryPoint = fileURLToPath(
  new URL("../../../src/index.js", import.meta.url),
);

/**
 * A stdio transport to the compiled server in its own temp and discovery
 * environment. Call dispose after the client closes.
 */
export function isolatedServerTransport(
  prefix: string,
  extraArguments: readonly string[] = [],
) {
  const temporary = mkdtempSync(join(tmpdir(), prefix));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entryPoint, ...extraArguments],
    cwd: process.cwd(),
    env: {
      ...getDefaultEnvironment(),
      ...isolatedDiscoveryEnvironment(temporary),
    },
  });
  return { transport, dispose: () => removeTemporaryTree(temporary) };
}
