// Shared helpers for the quality-guard MCP HTTP tests: temp roots and a
// connected client.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startQualityGuardHttpServer } from "../../src/index.js";

export function fixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `quality-http-${name}-`));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", `${name}.ts`), `export const ${name} = 1;\n`);
  return root;
}

export async function withClient<Result>(
  action: (client: Client) => Promise<Result>,
): Promise<Result> {
  const server = await startQualityGuardHttpServer({
    path: "/mcp",
    healthPath: "/health",
    port: 0,
  });
  const client = new Client({ name: "quality-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${server.port}${server.path}`),
    {
      reconnectionOptions: {
        initialReconnectionDelay: 1,
        maxReconnectionDelay: 1,
        reconnectionDelayGrowFactor: 1,
        maxRetries: 0,
      },
    },
  );
  try {
    await client.connect(transport);
    return await action(client);
  } finally {
    await client.close();
    await server.close();
  }
}
