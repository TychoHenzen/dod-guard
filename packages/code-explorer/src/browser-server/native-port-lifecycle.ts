import type { Server } from "node:http";
import type { Socket } from "node:net";

export function waitForListening(options: {
  server: Server;
  port: number;
  host: string;
  signal: AbortSignal;
}): Promise<void> {
  const { server, port, host, signal } = options;
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    server.once("error", (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
    server.listen(port, host, () => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    });
  });
}

export function closeServer(
  server: Server,
  sockets: Set<Socket>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const force = () => {
      for (const socket of sockets) socket.destroy();
    };
    signal.addEventListener("abort", force, { once: true });
    server.close(() => {
      signal.removeEventListener("abort", force);
      resolve();
    });
  });
}
