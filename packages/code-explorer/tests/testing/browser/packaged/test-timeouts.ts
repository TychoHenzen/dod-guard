import type { Locator, Page, Response } from "@playwright/test";

const DIAGNOSTIC_TEXT_LIMIT = 512;
const DIAGNOSTIC_STATUS_TIMEOUT_MS = 100;

interface PackagedFixtureDiagnostics {
  server: string;
  process: string;
}

const diagnosticsByPage = new WeakMap<Page, () => PackagedFixtureDiagnostics>();

export function registerPackagedFixtureDiagnostics(
  page: Page,
  provider: () => PackagedFixtureDiagnostics,
): void {
  diagnosticsByPage.set(page, provider);
}

function bounded(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, DIAGNOSTIC_TEXT_LIMIT);
}

async function visibleStatus(page: Page): Promise<string> {
  try {
    return bounded(
      (await page
        .locator('[data-area="status"]')
        .innerText({ timeout: DIAGNOSTIC_STATUS_TIMEOUT_MS })) ?? "",
    );
  } catch {
    return "unavailable";
  }
}

function fixtureDiagnostics(page: Page): PackagedFixtureDiagnostics {
  try {
    return (
      diagnosticsByPage.get(page)?.() ?? {
        server: "unavailable",
        process: "unavailable",
      }
    );
  } catch (error) {
    let failure = "unknown";
    if (error instanceof Error) failure = error.message;
    return { server: "unavailable", process: bounded(failure) };
  }
}

async function timeoutError(
  page: Page,
  description: string,
  cause: unknown,
): Promise<Error> {
  const diagnostics = fixtureDiagnostics(page);
  return new Error(
    [
      `packaged_browser_timeout:${description}`,
      `page_url=${JSON.stringify(bounded(page.url()))}`,
      `visible_status_text=${JSON.stringify(await visibleStatus(page))}`,
      `fixture_server=${JSON.stringify(bounded(diagnostics.server))}`,
      `fixture_process=${JSON.stringify(bounded(diagnostics.process))}`,
    ].join(" "),
    { cause },
  );
}

export const PACKAGED_BROWSER_TIMEOUT_MS = 10_000;

export async function waitForPackagedLocator(
  locator: Locator,
  description: string,
  timeout = PACKAGED_BROWSER_TIMEOUT_MS,
): Promise<void> {
  try {
    await locator.waitFor({ timeout });
  } catch (error) {
    throw await timeoutError(locator.page(), description, error);
  }
}

export async function waitForPackagedResponse(
  page: Page,
  predicate: (response: Response) => boolean | Promise<boolean>,
  description: string,
  timeout = PACKAGED_BROWSER_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await page.waitForResponse(predicate, { timeout });
  } catch (error) {
    throw await timeoutError(page, description, error);
  }
}
