import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { KnowledgeBase } from "./store.js";
import { registerKnowledgeTools } from "./tools.js";

function packageInfo(): { name: string; version: string } {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "package.json"), join(here, "..", "..", "package.json")];
  const packagePath = candidates.find((candidate) => existsSync(candidate));
  if (!packagePath) throw new Error("knowledge-base package.json is missing");
  return JSON.parse(readFileSync(packagePath, "utf8")) as { name: string; version: string };
}

function defaultKnowledgeBaseDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
}

function configuredKnowledgeBaseDir(): string {
  return process.env.DOD_GUARD_KNOWLEDGE_BASE_DIR?.trim() || defaultKnowledgeBaseDir();
}

export function createKnowledgeBaseServer(rootDir = configuredKnowledgeBaseDir()): McpServer {
  const pkg = packageInfo();
  const server = new McpServer({ name: pkg.name, version: pkg.version }, { capabilities: { tools: {} } });
  registerKnowledgeTools(server, new KnowledgeBase(rootDir));
  return server;
}

const server = createKnowledgeBaseServer();
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
  await server.connect(new StdioServerTransport());
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
