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
const coreCalls: Array<{ name: string; arguments_: Record<string, unknown> }> = [];

before(async () => {
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
  endpoint = `http://127.0.0.1:${(address as { port: number }).port}`;
  router = new BrowserHttpRouter({
    origin: endpoint,
    assetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "browser"),
    call: async (name, arguments_) => {
      coreCalls.push({ name, arguments_ });
      if (name === "code_status" && arguments_.action === "start_session") {
        return { schema_version: 1, state: "ready", data: { session_id: "core-session" } };
      }
      if (name === "code_status" && arguments_.action === "status") {
        return { schema_version: 1, state: "ready", data: {} };
      }
      if (name === "code_search" && arguments_.query === "") {
        return {
          schema_version: 1,
          state: "ready",
          data: {
            landmarks: [
              {
                group: "entry_points",
                symbols: [{ symbol_id: "symbol-main", name: "main", path: "src/main.ts", kind: "function" }],
              },
            ],
          },
        };
      }
      if (name === "code_search" && arguments_.query === "main") {
        return {
          schema_version: 1,
          state: "ready",
          data: {
            candidates: [
              {
                identity: "symbol-main",
                name: "main",
                match_class: "exact",
                score: 1,
                path: "src/main.ts",
                kind: "function",
              },
            ],
          },
        };
      }
      if (name === "code_focus" && arguments_.symbol_id === "symbol-main") {
        return {
          schema_version: 1,
          project_generation: 1,
          state: "ready",
          data: {
            view_id: "view-main",
            project_generation: 1,
            symbol_id: "symbol-main",
            name: "main",
            kind: "function",
            path: "src/main.ts",
            content: {
              body: "export function main() { return 1; }",
              truncated: false,
              limit_bytes: 32768,
              returned_bytes: 36,
              total_bytes: 36,
            },
            handles: [],
          },
        };
      }
      return {
        schema_version: 1,
        code: "invalid_request",
        message: "invalid_request",
        retryable: false,
      };
    },
  });
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
    await page.locator('[data-operation="search"]').waitFor({ timeout: 2_000 });
    assert.equal(await page.locator('[data-pane="relations"] h2').textContent(), "Relations");
    await page.locator('[data-operation="search"]').fill("main");
    await page.locator('[data-operation="search"]').blur();
    await page.locator('[data-discovery="results"] [data-symbol-id="symbol-main"]').waitFor({ timeout: 2_000 });
    await page.locator('[data-symbol-id="symbol-main"]').click();
    await page.locator('.focused-source[data-view-id="view-main"]').waitFor({ timeout: 2_000 });
    assert.match((await page.locator(".focused-source").textContent()) ?? "", /export function main/);
    assert.deepEqual(
      coreCalls.map(({ name, arguments_ }) => [name, arguments_.action ?? arguments_.query ?? arguments_.symbol_id]),
      [
        ["code_status", "start_session"],
        ["code_status", "status"],
        ["code_search", ""],
        ["code_search", "main"],
        ["code_focus", "symbol-main"],
      ],
    );
  });
});
