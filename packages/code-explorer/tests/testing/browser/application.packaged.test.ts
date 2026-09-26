import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  assertFileSearch,
  assertSymbolSearch,
} from "./application-actions.test.js";
import {
  type PackagedBrowserFixture,
  startPackagedBrowserFixture,
} from "./application-fixture.test.js";
import {
  PACKAGED_BROWSER_TIMEOUT_MS,
  waitForPackagedLocator,
} from "./packaged/test-timeouts.js";

let fixture: PackagedBrowserFixture;

before(async () => {
  fixture = await startPackagedBrowserFixture();
});

after(async () => {
  await fixture.close();
});

describe("packaged browser", () => {
  it("loads the shell and navigates to a symbol in Chromium", async () => {
    const page = await fixture.newPage();
    await assertSymbolSearch(page, fixture.coreCalls);
  });

  it("focuses a file candidate returned by discovery", async () => {
    const page = await fixture.newPage();
    await assertFileSearch(page);
  });

  it(
    "follows an available relation " + "from a focused source handle",
    async () => {
      const page = await fixture.newPage();
      await page.goto("/");
      await page.getByRole("button", { name: "main", exact: true }).click();
      await page.locator('mark[data-handle="handle-main"]').click();
      await page
        .getByRole("button", { name: "definition", exact: true })
        .click();
      await waitForPackagedLocator(
        page.locator('[data-pane="relations"][data-state="ready"]'),
        "available relation",
      );
      if (
        !fixture.coreCalls.some(
          (call) =>
            call.name === "code_follow" &&
            call.arguments_.relation === "definition",
        )
      ) {
        throw new Error("expected relation follow");
      }
    },
  );

  it("clears a navigation error after a successful focus", async () => {
    const page = await fixture.newPage();
    await page.goto("/");
    fixture.failNextFocus();
    await page.getByRole("button", { name: "main", exact: true }).click();
    await waitForPackagedLocator(
      page.locator('[data-area="status"]').getByText("focus_failed", {
        exact: true,
      }),
      "focus failure",
    );
    await page.getByRole("button", { name: "main", exact: true }).click();
    await waitForPackagedLocator(
      page.locator('.focused-source[data-view-id="view-main"]'),
      "recovered focus",
    );
    await waitForPackagedLocator(
      page.locator('[data-area="status"]').getByText("ready", {
        exact: true,
      }),
      "ready status",
    );
  });

  it(
    "renders a refresh failure " + "without an unhandled page error",
    async () => {
      const page = await fixture.newPage();
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
    },
  );

  it("lets browser-owned shutdown bypass a stuck page close", async () => {
    const page = await fixture.newPage();
    let releasePageClose: (() => void) | undefined;
    page.close = () =>
      new Promise<void>((resolve) => {
        releasePageClose = resolve;
      });
    const closePromise = fixture.close();
    const timedOut = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(
        () => resolve(true),
        PACKAGED_BROWSER_TIMEOUT_MS,
      );
      void closePromise.then(() => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    releasePageClose?.();
    await closePromise;
    assert.equal(timedOut, false);
  });
});
