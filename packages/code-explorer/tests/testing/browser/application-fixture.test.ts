import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, type Page, chromium } from "@playwright/test";
import { BrowserHttpRouter } from "../../../src/browser-server/http-router.js";
import type { CoreCall } from "./application-core.test.js";
import { createFixtureBehavior } from "./application-fixture-behavior.test.js";
import { startFixtureServer } from "./packaged/http-server.test.js";
import { PACKAGED_BROWSER_TIMEOUT_MS } from "./packaged/test-timeouts.js";

export type PackagedBrowserFixture = {
  browser: Browser;
  newPage: () => Promise<Page>;
  endpoint: string;
  coreCalls: CoreCall[];
  failNextFocus: () => void;
  failNextRefresh: () => void;
  holdNextLandmarks: () => () => void;
  holdNextFocus: (symbolId: string) => () => void;
  holdNextRelation: (relation: string) => () => void;
  close: () => Promise<void>;
};

export async function startPackagedBrowserFixture() {
  let router: BrowserHttpRouter;
  const server = await startFixtureServer(() => router);
  const endpoint = server.endpoint;
  const coreCalls: CoreCall[] = [];
  const behavior = createFixtureBehavior(coreCalls);
  router = new BrowserHttpRouter({
    origin: endpoint,
    assetRoot: path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
      "dist",
      "browser",
    ),
    call: behavior.call,
  });
  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    await server.close();
    throw error;
  }
  const pages = new Set<Page>();
  let closed = false;
  const newPage = async () => {
    const page = await browser.newPage({ baseURL: endpoint });
    page.setDefaultTimeout(PACKAGED_BROWSER_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(PACKAGED_BROWSER_TIMEOUT_MS);
    pages.add(page);
    page.once("close", () => pages.delete(page));
    return page;
  };
  return {
    browser,
    newPage,
    endpoint,
    coreCalls,
    ...behavior,
    close: async () => {
      if (closed) return;
      closed = true;
      try {
        await Promise.all([...pages].map((page) => page.close()));
      } finally {
        try {
          await browser.close();
        } finally {
          await server.close();
        }
      }
    },
  };
}
