import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import process from "node:process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 21_720;
const DEFAULT_PATH = "/mcp";
const DEFAULT_HEALTH_PATH = "/health";

export interface HttpServerOptions {
  host?: string;
  port?: number;
  path?: string;
  healthPath?: string;
  serviceName: string;
  createMcpServer: () => McpServer;
}

export interface RunningHttpServer {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly healthPath: string;
  close(): Promise<void>;
}

export interface HttpCliOptions {
  host: string;
  port: number;
  path: string;
  healthPath: string;
}

function requireLoopbackHost(host: string): string {
  const normalized = host.trim().toLowerCase();
  if (!["127.0.0.1", "::1", "localhost"].includes(normalized)) {
    throw new Error(
      `HTTP host must be loopback-only (127.0.0.1, ::1, or localhost): ${host}`,
    );
  }
  return host.trim();
}

function requirePort(port: number): number {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `HTTP port must be an integer between 0 and 65535: ${port}`,
    );
  }
  return port;
}

function requirePath(value: string, name: string): string {
  const normalized = value.trim();
  if (
    !normalized.startsWith("/") ||
    normalized.includes("?") ||
    normalized.includes("#")
  ) {
    throw new Error(
      `${name} must be an absolute URL path without a query or fragment: ${value}`,
    );
  }
  return normalizeHttpPath(normalized);
}

export function normalizeHttpPath(value: string): string {
  let end = value.length;
  while (end > 1 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function routePath(request: IncomingMessage): string {
  return normalizeHttpPath(
    new URL(request.url ?? "/", "http://127.0.0.1").pathname,
  );
}

function allowedHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

function allowedOrigins(port: number): string[] {
  return [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];
}

function acceptsLoopbackRequest(request: IncomingMessage, port: number): boolean {
  const host = request.headers.host?.toLowerCase();
  if (!host || !allowedHosts(port).includes(host)) return false;
  const origin = request.headers.origin;
  return origin === undefined || allowedOrigins(port).includes(origin);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  if (response.headersSent) return;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function addressPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP server did not expose a listening address");
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (
        error &&
        (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
      )
        reject(error);
      else resolve();
    });
    server.closeIdleConnections?.();
  });
}

export async function startMcpHttpServer(
  options: HttpServerOptions,
): Promise<RunningHttpServer> {
  const host = requireLoopbackHost(options.host ?? DEFAULT_HOST);
  const port = requirePort(options.port ?? DEFAULT_PORT);
  const path = requirePath(options.path ?? DEFAULT_PATH, "HTTP MCP path");
  const healthPath = requirePath(
    options.healthPath ?? DEFAULT_HEALTH_PATH,
    "HTTP health path",
  );
  const transports = new Set<StreamableHTTPServerTransport>();
  const server = createServer(async (request, response) => {
    const hostHeader = request.headers.host;
    if (!hostHeader || !acceptsLoopbackRequest(request, addressPort(server))) {
      json(response, 403, {
        error: "forbidden",
        service: options.serviceName,
      });
      return;
    }
    const requestedPath = routePath(request);
    if (requestedPath === healthPath && request.method === "GET") {
      json(response, 200, {
        service: options.serviceName,
        status: "ready",
        endpoint: path,
      });
      return;
    }
    if (requestedPath !== path) {
      json(response, 404, { error: "not_found", service: options.serviceName });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: true,
      allowedHosts: [hostHeader],
      allowedOrigins: allowedOrigins(addressPort(server)),
    });
    let mcpServer: McpServer | undefined;
    transports.add(transport);
    try {
      mcpServer = options.createMcpServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
      } else {
        json(response, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32_603,
            message: `${options.serviceName} HTTP request failed: ${error instanceof Error ? error.message : String(error)}`,
          },
          id: null,
        });
      }
    } finally {
      transports.delete(transport);
      await transport.close().catch(() => undefined);
      if (mcpServer) await mcpServer.close().catch(() => undefined);
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });
  } catch (error) {
    await closeServer(server).catch(() => undefined);
    const code =
      error && typeof error === "object" && "code" in error
        ? ` (${String(error.code)})`
        : "";
    throw new Error(
      `failed to bind ${options.serviceName} HTTP server on ${host}:${port}${code}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let closePromise: Promise<void> | undefined;
  return {
    host,
    port: addressPort(server),
    path,
    healthPath,
    close: () => {
      closePromise ??= (async () => {
        await closeServer(server);
        await Promise.all(
          [...transports].map((transport) =>
            transport.close().catch(() => undefined),
          ),
        );
      })();
      return closePromise;
    },
  };
}

function option(args: string[], name: string): string | undefined {
  return args
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function envOrOption(
  args: string[],
  name: string,
  envName: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  return option(args, name) ?? env[envName];
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) return DEFAULT_PORT;
  return requirePort(Number(value));
}

export function parseHttpCliOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): HttpCliOptions {
  return {
    host:
      envOrOption(args, "--host", "MCP_HOST_BIND_HOST", env) ?? DEFAULT_HOST,
    port: parsePort(envOrOption(args, "--port", "MCP_HOST_PORT", env)),
    path: envOrOption(args, "--path", "MCP_HOST_PATH", env) ?? DEFAULT_PATH,
    healthPath:
      envOrOption(args, "--health-path", "MCP_HOST_HEALTH_PATH", env) ??
      DEFAULT_HEALTH_PATH,
  };
}

export function installHttpSignalHandlers(
  running: Pick<RunningHttpServer, "close">,
  processLike: Pick<NodeJS.Process, "on" | "off"> = process,
): () => void {
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void running.close().catch((error) => {
      process.stderr.write(
        `MCP HTTP shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`,
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

export { DEFAULT_HEALTH_PATH, DEFAULT_HOST, DEFAULT_PATH, DEFAULT_PORT };
