import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { BrowserHttpRouter } from "../../../../src/browser-server/http-router.js";
import * as http from "../../../../src/browser-server/native-port-http.js";

export async function startFixtureServer(router: () => BrowserHttpRouter) {
  let requestCount = 0;
  let lastRequest = "none";
  let closeCalls = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    lastRequest = `${request.method ?? "GET"} ${request.url ?? "/"}`;
    http.serverRequestHandler(router(), { open: true })(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
  const close = () => {
    closeCalls += 1;
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };
  const diagnostics = () =>
    `listening=${server.listening}; requests=${requestCount}; last_request=${lastRequest}; close_calls=${closeCalls}`;
  return { endpoint, close, diagnostics };
}
