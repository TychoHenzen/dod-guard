import { spawn } from "node:child_process";
import path from "node:path";
import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { createNativeProjectRoot, ProjectPathError, type ProjectRoot } from "../semantic/project-root.js";
import { BrowserHttpRouter, type BrowserCoreReply } from "./http-router.js";

export type BrowserServerErrorCode = "invalid_request" | "invalid_project_root" | "browser_port_unavailable";

export class BrowserServerError extends Error {
  constructor(readonly code: BrowserServerErrorCode) {
    super(code);
  }
}

export type ExplorerCore = {
  close(signal: AbortSignal): Promise<void>;
  call?(name: string, arguments_: Record<string, unknown>): Promise<BrowserCoreReply>;
};
export type ExplorerCoreFactory = {
  start(input: { projectRoot: ProjectRoot; signal: AbortSignal }): Promise<ExplorerCore>;
};

export type HttpListener = {
  readonly address: URL;
  stopAdmission(): void;
  close(signal: AbortSignal): Promise<void>;
};

export type PortBinder = {
  listen(host: "127.0.0.1", port: number, signal: AbortSignal, core?: ExplorerCore): Promise<HttpListener>;
};

export type BrowserOpener = { open(url: URL, signal: AbortSignal): Promise<void> };
export type ServeArguments = { project_root: string; no_open: boolean };
export type BrowserServer = { url: URL; projectRoot: ProjectRoot; close(): Promise<void> };

const firstPort = 4410;
const lastPort = 4429;

export function parseServeArguments(arguments_: readonly string[]): ServeArguments {
  if (arguments_[0] !== "serve") throw new BrowserServerError("invalid_request");
  let projectRoot = ".";
  let noOpen = false;
  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--no-open" && !noOpen) {
      noOpen = true;
      continue;
    }
    if (argument === "--project-root" && projectRoot === ".") {
      const value = arguments_[index + 1];
      if (!value) throw new BrowserServerError("invalid_request");
      projectRoot = value;
      index += 1;
      continue;
    }
    throw new BrowserServerError("invalid_request");
  }
  return { project_root: projectRoot, no_open: noOpen };
}

export async function startBrowserServer(options: {
  project_root: string;
  no_open: boolean;
  coreFactory: ExplorerCoreFactory;
  binder: PortBinder;
  opener: BrowserOpener;
  signal?: AbortSignal;
  write?: (line: string) => void;
  writeError?: (line: string) => void;
}): Promise<BrowserServer> {
  const controller = new AbortController();
  const parentSignal = options.signal;
  const abort = () => controller.abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  let projectRoot: ProjectRoot;
  try {
    projectRoot = createNativeProjectRoot(options.project_root);
  } catch (error) {
    if (error instanceof ProjectPathError) throw new BrowserServerError("invalid_project_root");
    throw error;
  }
  let core: ExplorerCore | undefined;
  let listener: HttpListener | undefined;
  try {
    core = await options.coreFactory.start({ projectRoot, signal: controller.signal });
    for (let port = firstPort; port <= lastPort; port += 1) {
      try {
        listener = await options.binder.listen("127.0.0.1", port, controller.signal, core);
        break;
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) throw error;
      }
    }
    if (!listener) throw new BrowserServerError("browser_port_unavailable");
    options.write?.(`Code Explorer: ${listener.address.href}`);
    if (!options.no_open) {
      try {
        await options.opener.open(listener.address, controller.signal);
      } catch {
        options.writeError?.("browser_open_failed");
      }
    }
    let closing: Promise<void> | undefined;
    return {
      url: listener.address,
      projectRoot,
      close: () =>
        (closing ??= (async () => {
          controller.abort();
          listener?.stopAdmission();
          const timeout = AbortSignal.timeout(10_000);
          await Promise.allSettled([listener?.close(timeout), core?.close(timeout)]);
          parentSignal?.removeEventListener("abort", abort);
        })()),
    };
  } catch (error) {
    controller.abort();
    const timeout = AbortSignal.timeout(10_000);
    await Promise.allSettled([listener?.close(timeout), core?.close(timeout)]);
    parentSignal?.removeEventListener("abort", abort);
    throw error;
  }
}

/** Production binder exposes only the fixed browser routes for one already-frozen core. */
export const nativePortBinder: PortBinder = {
  async listen(host, port, signal, core) {
    if (signal.aborted) throw new Error("aborted");
    const sockets = new Set<Socket>();
    let admitting = true;
    const server: Server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
      if (!admitting) {
        response.destroy();
        return;
      }
      const origin = `http://${host}:${port}`;
      const router = new BrowserHttpRouter({
        origin,
        assetRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), "browser"),
        call: core?.call ?? (async () => ({ schema_version: 1, code: "workspace_unavailable", message: "workspace_unavailable", retryable: true })),
      });
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        void router.handle({
          method: request.method ?? "GET",
          path: request.url ?? "/",
          headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])),
          body: Buffer.concat(chunks),
        }).then((result) => {
          response.statusCode = result.status;
          for (const [key, value] of Object.entries(result.headers)) response.setHeader(key, value);
          response.end(result.body);
        });
      });
    });
    server.headersTimeout = 5_000;
    server.keepAliveTimeout = 5_000;
    server.maxRequestsPerSocket = 100;
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new Error("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      server.once("error", (error) => { signal.removeEventListener("abort", onAbort); reject(error); });
      server.listen(port, host, () => { signal.removeEventListener("abort", onAbort); resolve(); });
    });
    return {
      address: new URL(`http://${host}:${port}/`),
      stopAdmission: () => { admitting = false; },
      close: async (closeSignal) => {
        if (!server.listening) return;
        await new Promise<void>((resolve) => {
          const force = () => { for (const socket of sockets) socket.destroy(); };
          closeSignal.addEventListener("abort", force, { once: true });
          server.close(() => { closeSignal.removeEventListener("abort", force); resolve(); });
        });
      },
    };
  },
};

export const nativeBrowserOpener: BrowserOpener = {
  async open(url, signal) {
    const href = url.href;
    const command = process.platform === "win32" ? "cmd.exe" : process.platform === "darwin" ? "/usr/bin/open" : process.platform === "linux" ? "xdg-open" : undefined;
    if (!command) throw new Error("unsupported platform");
    const arguments_ = process.platform === "win32" ? ["/d", "/s", "/c", "start", "", href] : [href];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, arguments_, { detached: true, stdio: "ignore", windowsHide: true });
      const onAbort = () => reject(new Error("aborted"));
      signal.addEventListener("abort", onAbort, { once: true });
      child.once("error", (error) => { signal.removeEventListener("abort", onAbort); reject(error); });
      child.once("spawn", () => { signal.removeEventListener("abort", onAbort); child.unref(); resolve(); });
    });
  },
};
