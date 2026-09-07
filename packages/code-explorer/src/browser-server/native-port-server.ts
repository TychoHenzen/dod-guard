import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unavailableBrowserCall } from "./browser-unavailable-call.js";
import type { ExplorerCore } from "./explorer-core.js";
import { BrowserHttpRouter } from "./http-router.js";
import { serverRequestHandler } from "./native-port-http.js";

type NativeServer = {
  server: Server;
  sockets: Set<Socket>;
  admission: { open: boolean };
};

export function createNativeServer(
  host: string,
  port: number,
  core?: ExplorerCore,
): NativeServer {
  const sockets = new Set<Socket>();
  const admission = { open: true };
  const router = new BrowserHttpRouter({
    origin: `http://${host}:${port}`,
    assetRoot: path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "browser",
    ),
    call: core?.call ?? unavailableBrowserCall,
  });
  const server = createServer(
    { maxHeaderSize: 16 * 1024 },
    serverRequestHandler(router, admission),
  );
  configureServer(server, sockets);
  return { server, sockets, admission };
}

function configureServer(server: Server, sockets: Set<Socket>): void {
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
}
