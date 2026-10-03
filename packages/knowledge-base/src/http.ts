import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import process from "node:process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { KnowledgeBase } from "./store.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 21_721;
const DEFAULT_PATH = "/mcp";
const DEFAULT_HEALTH_PATH = "/health";

export interface KnowledgeHttpOptions {
  host?: string;
  port?: number;
  path?: string;
  healthPath?: string;
  rootDir: string;
  createMcpServer: () => McpServer;
}

export interface RunningKnowledgeHttpServer {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly healthPath: string;
  close(): Promise<void>;
}

export interface KnowledgeHttpCliOptions {
  host: string;
  port: number;
  path: string;
  healthPath: string;
}

function loopback(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (!["127.0.0.1", "::1", "localhost"].includes(normalized)) {
    throw new Error(`HTTP host must be loopback-only (127.0.0.1, ::1, or localhost): ${host}`);
  }
  return host.trim();
}

function port(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new Error(`HTTP port must be an integer between 0 and 65535: ${value}`);
  }
  return value;
}

function endpoint(value: string, name: string): string {
  const result = value.trim();
  if (!result.startsWith("/") || result.includes("?") || result.includes("#")) {
    throw new Error(`${name} must be an absolute URL path without a query or fragment: ${value}`);
  }
  return result.length > 1 ? result.replace(/\/+$/u, "") : result;
}

function requestPath(request: IncomingMessage): string {
  return new URL(request.url ?? "/", "http://127.0.0.1").pathname.replace(/\/+$/u, "") || "/";
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function listeningPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("knowledge-base HTTP server did not expose a listening address");
  return address.port;
}

async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(error);
      else resolve();
    });
    server.closeAllConnections?.();
  });
}

export async function startKnowledgeBaseHttpServer(options: KnowledgeHttpOptions): Promise<RunningKnowledgeHttpServer> {
  const root = new KnowledgeBase(options.rootDir);
  await root.validate();

  const host = loopback(options.host ?? DEFAULT_HOST);
  const requestedPort = port(options.port ?? DEFAULT_PORT);
  const mcpPath = endpoint(options.path ?? DEFAULT_PATH, "HTTP MCP path");
  const healthPath = endpoint(options.healthPath ?? DEFAULT_HEALTH_PATH, "HTTP health path");
  const transports = new Set<StreamableHTTPServerTransport>();
  const sockets = new Set<Socket>();
  const server = createServer(async (request, response) => {
    const path = requestPath(request);
    if (path === healthPath && request.method === "GET") {
      sendJson(response, 200, { service: "knowledge-base", status: "ready", endpoint: mcpPath, root: root.rootDir });
      return;
    }
    if (path !== mcpPath) {
      sendJson(response, 404, { error: "not_found", service: "knowledge-base" });
      return;
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcpServer = options.createMcpServer();
    transports.add(transport);
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
      } else {
        sendJson(response, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32_603,
            message: `knowledge-base HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
          },
          id: null,
        });
      }
    } finally {
      transports.delete(transport);
      await transport.close().catch(() => undefined);
      await mcpServer.close().catch(() => undefined);
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => {
        server.off("listening", ready);
        reject(error);
      };
      const ready = () => {
        server.off("error", failed);
        resolve();
      };
      server.once("error", failed);
      server.once("listening", ready);
      server.listen(requestedPort, host);
    });
  } catch (error) {
    await closeHttpServer(server).catch(() => undefined);
    const code = error && typeof error === "object" && "code" in error ? ` (${String(error.code)})` : "";
    throw new Error(
      `failed to bind knowledge-base HTTP server on ${host}:${requestedPort}${code}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let closePromise: Promise<void> | undefined;
  return {
    host,
    port: listeningPort(server),
    path: mcpPath,
    healthPath,
    close: () => {
      closePromise ??= (async () => {
        await Promise.all([...transports].map((transport) => transport.close().catch(() => undefined)));
        for (const socket of sockets) socket.destroy();
        await closeHttpServer(server);
      })();
      return closePromise;
    },
  };
}

function argument(args: string[], name: string): string | undefined {
  return args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

function configured(args: string[], name: string, environment: string, env: NodeJS.ProcessEnv): string | undefined {
  return argument(args, name) ?? env[environment];
}

function configuredPort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) return DEFAULT_PORT;
  return port(Number(value));
}

export function parseKnowledgeHttpCliOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): KnowledgeHttpCliOptions {
  return {
    host: configured(args, "--host", "MCP_HOST_BIND_HOST", env) ?? DEFAULT_HOST,
    port: configuredPort(configured(args, "--port", "MCP_HOST_PORT", env)),
    path: configured(args, "--path", "MCP_HOST_PATH", env) ?? DEFAULT_PATH,
    healthPath: configured(args, "--health-path", "MCP_HOST_HEALTH_PATH", env) ?? DEFAULT_HEALTH_PATH,
  };
}

export function installKnowledgeHttpSignals(
  running: Pick<RunningKnowledgeHttpServer, "close">,
  processLike: Pick<NodeJS.Process, "on" | "off"> = process,
): () => void {
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void running.close().catch((error) => {
      process.stderr.write(
        `knowledge-base HTTP shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
  };
  processLike.on("SIGINT", shutdown);
  processLike.on("SIGTERM", shutdown);
  return () => {
    processLike.off("SIGINT", shutdown);
    processLike.off("SIGTERM", shutdown);
  };
}
