import assert from "node:assert/strict";
import type { Page } from "@playwright/test";
import type { CoreCall } from "./application-core.test.js";
import type { PackagedBrowserFixture } from "./application-fixture.test.js";
import { assertCoreCalls } from "./packaged/core-calls.test.js";
import {
  waitForPackagedLocator,
  waitForPackagedResponse,
} from "./packaged/test-timeouts.js";

export async function assertSymbolSearch(
  page: Page,
  coreCalls: CoreCall[],
): Promise<void> {
  await assertInitialShell(page);
  await page.locator('[data-operation="search"]').fill("main");
  await waitForPackagedLocator(
    page.locator('[data-discovery="results"] [data-symbol-id="symbol-main"]'),
    "symbol search result",
  );
  await page.locator('[data-symbol-id="symbol-main"]').click();
  await waitForPackagedLocator(
    page.locator('.focused-source[data-view-id="view-main"]'),
    "symbol focus",
  );
  assert.match(
    (await page.locator(".focused-source").textContent()) ?? "",
    /export function main/,
  );
  assertCoreCalls(coreCalls);
}

export async function assertFileSearch(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-operation="search"]').fill("client");
  const candidate = page.locator(
    '[data-symbol-id="file:src/browser/client.ts"]',
  );
  await waitForPackagedLocator(candidate, "file search candidate");
  await candidate.click();
  await waitForPackagedLocator(
    page.locator('.focused-source[data-view-id="view-client"]'),
    "file focus",
  );
  assert.match(
    (await page.locator(".focused-source").textContent()) ?? "",
    /export const client/,
  );
}

export async function assertRefreshFailure(
  page: Page,
  fixture: PackagedBrowserFixture,
): Promise<void> {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto("/");
  fixture.failNextRefresh();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await waitForPackagedLocator(
    page.locator('[data-area="status"]').getByText("refresh_failed", {
      exact: true,
    }),
    "refresh failure",
  );
  assert.equal(pageErrors.length, 0);
}

async function assertInitialShell(page: Page): Promise<void> {
  const script = waitForPackagedResponse(
    page,
    (response) => response.url().endsWith("/client.js"),
    "client script",
  );
  const style = waitForPackagedResponse(
    page,
    (response) => response.url().endsWith("/style.css"),
    "stylesheet",
  );
  await page.goto("/");
  assert.equal((await script).status(), 200);
  assert.equal((await style).status(), 200);
  await waitForPackagedLocator(
    page.locator('[data-operation="search"]'),
    "search control",
  );
  assert.equal(
    await page.locator('[data-pane="relations"] h2').textContent(),
    "Relations",
  );
}
