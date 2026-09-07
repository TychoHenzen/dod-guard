import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "@playwright/test";
import { BrowserHttpRouter } from "../../browser-server/http-router.js";
import type { CoreCall } from "./application-core.test.js";
import { createFixtureBehavior } from "./application-fixture-behavior.test.js";
import { startFixtureServer } from "./packaged/http-server.test.js";

export type PackagedBrowserFixture = {
  browser: Browser;
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
      "browser",
    ),
    call: behavior.call,
  });
  const browser = await chromium.launch({ headless: true });
  return {
    browser,
    endpoint,
    coreCalls,
    ...behavior,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}
