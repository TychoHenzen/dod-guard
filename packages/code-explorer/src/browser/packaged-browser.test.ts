import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "@playwright/test";
import { BrowserHttpRouter } from "../browser-server/http-router.js";

let browser: Browser;
let endpoint = "";
let closeServer: (() => Promise<void>) | undefined;

before(async () => {
  const server = createServer((request, response) => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const router = new BrowserHttpRouter({
      origin: `http://127.0.0.1:${port}`,
      assetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "browser"),
      call: async () => ({
        schema_version: 1,
        code: "invalid_browser_session",
        message: "invalid_browser_session",
        retryable: false,
      }),
    });
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
  endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
  closeServer = () => new Promise((resolve) => server.close(() => resolve()));
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await closeServer?.();
});

describe("packaged browser", () => {
  it("loads the compiled shell and its same-origin assets in Chromium", async () => {
    const page = await browser.newPage();
    const script = page.waitForResponse((response) => response.url().endsWith("/client.js"));
    const style = page.waitForResponse((response) => response.url().endsWith("/style.css"));
    await page.goto(`${endpoint}/`);
    assert.equal((await script).status(), 200);
    assert.equal((await style).status(), 200);
    await assert.doesNotReject(() => page.locator("#code-explorer").waitFor({ state: "visible" }));
    assert.match((await page.locator("#code-explorer").textContent()) ?? "", /Code Explorer/);
  });
});
