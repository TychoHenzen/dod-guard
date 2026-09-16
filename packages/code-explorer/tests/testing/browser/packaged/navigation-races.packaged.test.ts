import { after, before, describe, it } from "node:test";
import {
  type PackagedBrowserFixture,
  startPackagedBrowserFixture,
} from "../application-fixture.test.js";

let fixture: PackagedBrowserFixture;

before(async () => {
  fixture = await startPackagedBrowserFixture();
});

after(async () => {
  await fixture.close();
});

describe("packaged browser response ordering", () => {
  it(
    "keeps completed search results " +
      "when the initial landmarks arrive late",
    async () => {
      const releaseLandmarks = fixture.holdNextLandmarks();
      const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
      await page.goto("/");
      await page.locator('[data-operation="search"]').fill("main");
      const candidate = page.locator(
        '[data-discovery="results"] [data-symbol-id="symbol-main"]',
      );
      await candidate.waitFor({ timeout: 2000 });
      const landmarks = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/search") &&
          response.request().postDataJSON().query === "",
      );
      releaseLandmarks();
      await landmarks;
      await candidate.waitFor({ timeout: 2000 });
    },
  );
  it(
    "keeps the newest focus when " + "an older request finishes late",
    async () => {
      const releaseMain = fixture.holdNextFocus("symbol-main");
      const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
      await page.goto("/");
      await page.getByRole("button", { name: "main", exact: true }).click();
      await page.locator('[data-operation="search"]').fill("client");
      await page
        .locator('[data-symbol-id="file:src/browser/client.ts"]')
        .click();
      await page
        .locator('.focused-source[data-view-id="view-client"]')
        .waitFor();
      const mainFocus = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/focus") &&
          response.request().postDataJSON().symbol_id === "symbol-main",
      );
      releaseMain();
      await mainFocus;
      await page
        .locator('.focused-source[data-view-id="view-client"]')
        .waitFor();
    },
  );
});
