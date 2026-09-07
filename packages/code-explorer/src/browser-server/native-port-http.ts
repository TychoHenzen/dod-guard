import type { IncomingMessage, ServerResponse } from "node:http";
import type { BrowserHttpResponse } from "./browser-http-response.js";
import { BrowserHttpRouter } from "./http-router.js";

function responseHeaders(
  response: ServerResponse,
  headers: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(headers))
    response.setHeader(key, value);
}

function requestHeaders(
  request: IncomingMessage,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(request.headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

function writeResponse(
  response: ServerResponse,
  result: BrowserHttpResponse,
): void {
  response.statusCode = result.status;
  responseHeaders(response, result.headers);
  response.end(result.body);
}

function handleRequest(
  router: BrowserHttpRouter,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    void router
      .handle({
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: requestHeaders(request),
        body: Buffer.concat(chunks),
      })
      .then((result) => writeResponse(response, result));
  });
}

export function serverRequestHandler(
  router: BrowserHttpRouter,
  admission: { open: boolean },
) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    if (!admission.open) {
      response.destroy();
      return;
    }
    handleRequest(router, request, response);
  };
}
