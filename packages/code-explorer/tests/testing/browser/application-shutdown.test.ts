import assert from "node:assert/strict";
import type { PackagedBrowserFixture } from "./application-fixture.test.js";
import { PACKAGED_BROWSER_TIMEOUT_MS } from "./packaged/test-timeouts.js";

export async function assertBrowserOwnedShutdown(
  fixture: PackagedBrowserFixture,
): Promise<void> {
  const page = await fixture.newPage();
  const browserClose = fixture.browser.close.bind(fixture.browser);
  let browserCloseCalls = 0;
  fixture.browser.close = async () => {
    browserCloseCalls += 1;
    await browserClose();
  };
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
  await fixture.close();
  assert.equal(timedOut, false);
  assert.equal(browserCloseCalls, 1);
  assert.equal(fixture.browser.isConnected(), false);
  assert.match(
    fixture.serverDiagnostics(),
    /listening=false; .*close_calls=1$/,
  );
}
