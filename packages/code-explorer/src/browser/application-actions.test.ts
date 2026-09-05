import assert from "node:assert/strict";
import type { Page } from "@playwright/test";
import type { CoreCall } from "./application-core.test.js";

export async function assertSymbolSearch(page: Page, coreCalls: CoreCall[]): Promise<void> {
  const script = page.waitForResponse((response) => response.url().endsWith("/client.js"));
  const style = page.waitForResponse((response) => response.url().endsWith("/style.css"));
  await page.goto("/");
  assert.equal((await script).status(), 200);
  assert.equal((await style).status(), 200);
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
}

export async function assertFileSearch(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-operation="search"]').fill("client");
  await page.locator('[data-operation="search"]').blur();
  const candidate = page.locator('[data-symbol-id="file:src/browser/client.ts"]');
  await candidate.waitFor({ timeout: 2_000 });
  await candidate.click();
  await page.locator('.focused-source[data-view-id="view-client"]').waitFor({ timeout: 2_000 });
  assert.match((await page.locator(".focused-source").textContent()) ?? "", /export const client/);
}
