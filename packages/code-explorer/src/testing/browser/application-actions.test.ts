import assert from "node:assert/strict";
import type { Page } from "@playwright/test";
import type { CoreCall } from "./application-core.test.js";
import { assertCoreCalls } from "./packaged/core-calls.test.js";

export async function assertSymbolSearch(
  page: Page,
  coreCalls: CoreCall[],
): Promise<void> {
  await assertInitialShell(page);
  await page.locator('[data-operation="search"]').fill("main");
  await page
    .locator('[data-discovery="results"] [data-symbol-id="symbol-main"]')
    .waitFor({ timeout: 2000 });
  await page.locator('[data-symbol-id="symbol-main"]').click();
  await page
    .locator('.focused-source[data-view-id="view-main"]')
    .waitFor({ timeout: 2000 });
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
  await candidate.waitFor({ timeout: 2000 });
  await candidate.click();
  await page
    .locator('.focused-source[data-view-id="view-client"]')
    .waitFor({ timeout: 2000 });
  assert.match(
    (await page.locator(".focused-source").textContent()) ?? "",
    /export const client/,
  );
}

async function assertInitialShell(page: Page): Promise<void> {
  const script = page.waitForResponse((response) =>
    response.url().endsWith("/client.js"),
  );
  const style = page.waitForResponse((response) =>
    response.url().endsWith("/style.css"),
  );
  await page.goto("/");
  assert.equal((await script).status(), 200);
  assert.equal((await style).status(), 200);
  await page.locator('[data-operation="search"]').waitFor({ timeout: 2000 });
  assert.equal(
    await page.locator('[data-pane="relations"] h2').textContent(),
    "Relations",
  );
}
