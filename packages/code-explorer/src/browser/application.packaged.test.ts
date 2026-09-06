import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { assertFileSearch, assertSymbolSearch } from "./application-actions.test.js";
import { type PackagedBrowserFixture, startPackagedBrowserFixture } from "./application-fixture.test.js";

let fixture: PackagedBrowserFixture;

before(async () => {
  fixture = await startPackagedBrowserFixture();
});

after(async () => {
  await fixture.close();
});

describe("packaged browser", () => {
  it("loads the shell and navigates to a symbol in Chromium", async () => {
    const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
    await assertSymbolSearch(page, fixture.coreCalls);
  });

  it("focuses a file candidate returned by discovery", async () => {
    const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
    await assertFileSearch(page);
  });

  it("follows an available relation from a focused source handle", async () => {
    const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
    await page.goto("/");
    await page.getByRole("button", { name: "main", exact: true }).click();
    await page.locator('mark[data-handle="handle-main"]').click();
    await page.getByRole("button", { name: "definition", exact: true }).click();
    await page.locator('[data-pane="relations"][data-state="ready"]').waitFor();
    if (!fixture.coreCalls.some((call) => call.name === "code_follow" && call.arguments_.relation === "definition")) {
      throw new Error("expected relation follow");
    }
  });

  it("clears a navigation error after a successful focus", async () => {
    const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
    await page.goto("/");
    fixture.failNextFocus();
    await page.getByRole("button", { name: "main", exact: true }).click();
    await page.locator('[data-area="status"]').getByText("focus_failed", { exact: true }).waitFor();
    await page.getByRole("button", { name: "main", exact: true }).click();
    await page.locator('.focused-source[data-view-id="view-main"]').waitFor();
    await page.locator('[data-area="status"]').getByText("ready", { exact: true }).waitFor();
  });

  it("renders a refresh failure without an unhandled page error", async () => {
    const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    await page.goto("/");
    fixture.failNextRefresh();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.locator('[data-area="status"]').getByText("refresh_failed", { exact: true }).waitFor();
    assert.equal(pageErrors.length, 0);
  });
});
