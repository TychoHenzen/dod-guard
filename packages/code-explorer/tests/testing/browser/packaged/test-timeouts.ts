import type { Locator, Page, Response } from "@playwright/test";

export const PACKAGED_BROWSER_TIMEOUT_MS = 10_000;

export async function waitForPackagedLocator(
  locator: Locator,
  description: string,
): Promise<void> {
  try {
    await locator.waitFor({ timeout: PACKAGED_BROWSER_TIMEOUT_MS });
  } catch (error) {
    throw new Error(`packaged_browser_timeout:${description}`, {
      cause: error,
    });
  }
}

export async function waitForPackagedResponse(
  page: Page,
  predicate: (response: Response) => boolean | Promise<boolean>,
  description: string,
): Promise<Response> {
  try {
    return await page.waitForResponse(predicate, {
      timeout: PACKAGED_BROWSER_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Error(`packaged_browser_timeout:${description}`, {
      cause: error,
    });
  }
}
