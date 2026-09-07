import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { BrowserHttpRouter } from "../../../browser-server/http-router.js";
import * as http from "../../../browser-server/native-port-http.js";

export async function startFixtureServer(router: () => BrowserHttpRouter) {
  const server = createServer((request, response) =>
    http.serverRequestHandler(router(), { open: true })(request, response),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
  const close = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  return { endpoint, close };
}
