import process from "node:process";
import type { Browser, Page } from "@playwright/test";
import type { CoreCall } from "./application-core.test.js";
import {
  registerPackagedFixtureDiagnostics,
} from "./packaged/test-timeouts.js";

export function registerFixtureDiagnostics(
  page: Page,
  server: { diagnostics: () => string },
  browser: Browser,
  coreCalls: CoreCall[],
): void {
  const processDiagnostics = () =>
    [
      `pid=${process.pid}`,
      `browser_connected=${browser.isConnected()}`,
      `pages=${browser.contexts().reduce(
        (count, context) => count + context.pages().length,
        0,
      )}`,
      `core_calls=${coreCalls.length}`,
    ].join("; ");
  registerPackagedFixtureDiagnostics(page, () => ({
    server: server.diagnostics(),
    process: processDiagnostics(),
  }));
}
