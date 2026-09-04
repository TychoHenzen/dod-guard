import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "@playwright/test";
import { BrowserHttpRouter } from "../browser-server/http-router.js";
import { type CoreCall, createPackagedCore } from "./application-core.test.js";

export type PackagedBrowserFixture = {
  browser: Browser;
  endpoint: string;
  coreCalls: CoreCall[];
  close: () => Promise<void>;
};

export async function startPackagedBrowserFixture(): Promise<PackagedBrowserFixture> {
  let router: BrowserHttpRouter;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      void router
        .handle({
          method: request.method ?? "GET",
          path: request.url ?? "/",
          headers: Object.fromEntries(
            Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
          ),
          body: Buffer.concat(chunks),
        })
        .then((result) => {
          response.writeHead(result.status, result.headers);
          response.end(result.body);
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
  const coreCalls: CoreCall[] = [];
  router = new BrowserHttpRouter({
    origin: endpoint,
    assetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "browser"),
    call: createPackagedCore(coreCalls),
  });
  const browser = await chromium.launch({ headless: true });
  return {
    browser,
    endpoint,
    coreCalls,
    close: async () => {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
