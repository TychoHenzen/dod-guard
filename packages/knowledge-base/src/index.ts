import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  installKnowledgeHttpSignals,
  type KnowledgeHttpOptions,
  parseKnowledgeHttpCliOptions,
  startKnowledgeBaseHttpServer as startKnowledgeBaseHttpService,
} from "./http.js";
import { KnowledgeBase } from "./store.js";
import { registerKnowledgeTools } from "./tools.js";

function packageInfo(): { name: string; version: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "package.json"), join(here, "..", "..", "package.json")];
  const packagePath = candidates.find((candidate) => existsSync(candidate));
  if (!packagePath) throw new Error("knowledge-base package.json is missing");
  return JSON.parse(readFileSync(packagePath, "utf8")) as { name: string; version: string };
}

const KNOWLEDGE_BASE_DIR_ENV = "DOD_GUARD_KNOWLEDGE_BASE_DIR";

export function defaultKnowledgeBaseDir(): string {
  const rootDir = process.env[KNOWLEDGE_BASE_DIR_ENV];
  if (!rootDir?.trim()) {
    throw new Error(`${KNOWLEDGE_BASE_DIR_ENV} must be set to the external knowledge-base root`);
  }
  return rootDir;
}

export function createKnowledgeBaseServer(rootDir = defaultKnowledgeBaseDir()): McpServer {
  const pkg = packageInfo();
  const server = new McpServer({ name: pkg.name, version: pkg.version }, { capabilities: { tools: {} } });
  registerKnowledgeTools(server, new KnowledgeBase(rootDir));
  return server;
}

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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] === "--http") {
    const rootDir = process.env[KNOWLEDGE_BASE_DIR_ENV];
    if (!rootDir?.trim()) throw new Error(`${KNOWLEDGE_BASE_DIR_ENV} must be set to the external knowledge-base root`);
    const running = await startKnowledgeBaseHttpServer({
      ...parseKnowledgeHttpCliOptions(args.slice(1)),
      rootDir,
    });
    installKnowledgeHttpSignals(running);
    process.stderr.write(`knowledge-base HTTP ready at http://${running.host}:${running.port}${running.path}\n`);
    return;
  }
  const server = createKnowledgeBaseServer();
  await server.connect(new StdioServerTransport());
}

export function startKnowledgeBaseHttpServer(options: Omit<KnowledgeHttpOptions, "createMcpServer">) {
  return startKnowledgeBaseHttpService({
    ...options,
    createMcpServer: () => createKnowledgeBaseServer(options.rootDir),
  });
}

if (isMainModule()) {
  main().catch((error) => {
    process.stderr.write(`knowledge-base MCP server failed: ${error}\n`);
    process.exit(1);
  });
}

export type {
  EntrySummary,
  KnowledgeEntry,
  KnowledgeIndex,
  SourceReference,
} from "./schema.js";
export { KnowledgeBase } from "./store.js";
