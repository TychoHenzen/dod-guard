import assert from "node:assert/strict";
import type { PackagedBrowserFixture } from "./application-fixture.test.js";
import { PACKAGED_BROWSER_TIMEOUT_MS } from "./packaged/test-timeouts.js";

export async function assertBrowserOwnedShutdown(
  fixture: PackagedBrowserFixture,
): Promise<void> {
  const page = await fixture.newPage();
  let releasePageClose: (() => void) | undefined;
  page.close = () =>
    new Promise<void>((resolve) => {
      releasePageClose = resolve;
    });
  const closePromise = fixture.close();
  const timedOut = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(true), PACKAGED_BROWSER_TIMEOUT_MS);
    void closePromise.then(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  releasePageClose?.();
  await closePromise;
  assert.equal(timedOut, false);
}
