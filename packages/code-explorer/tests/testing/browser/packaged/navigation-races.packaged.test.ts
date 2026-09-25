import { after, before, describe, it } from "node:test";
import {
  type PackagedBrowserFixture,
  startPackagedBrowserFixture,
} from "../application-fixture.test.js";
import {
  waitForPackagedLocator,
  waitForPackagedResponse,
} from "./test-timeouts.js";

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
      const page = await fixture.newPage();
      await page.goto("/");
      await page.locator('[data-operation="search"]').fill("main");
      const candidate = page.locator(
        '[data-discovery="results"] [data-symbol-id="symbol-main"]',
      );
      await waitForPackagedLocator(candidate, "late search result");
      const landmarks = waitForPackagedResponse(
        page,
        (response) =>
          response.url().endsWith("/api/search") &&
          response.request().postDataJSON().query === "",
        "initial landmarks",
      );
      releaseLandmarks();
      await landmarks;
      await waitForPackagedLocator(candidate, "completed search result");
    },
  );
  it(
    "keeps the newest focus when " + "an older request finishes late",
    async () => {
      const releaseMain = fixture.holdNextFocus("symbol-main");
      const page = await fixture.newPage();
      await page.goto("/");
      await page.getByRole("button", { name: "main", exact: true }).click();
      await page.locator('[data-operation="search"]').fill("client");
      await page
        .locator('[data-symbol-id="file:src/browser/client.ts"]')
        .click();
      await waitForPackagedLocator(
        page.locator('.focused-source[data-view-id="view-client"]'),
        "race focus",
      );
      const mainFocus = waitForPackagedResponse(
        page,
        (response) =>
          response.url().endsWith("/api/focus") &&
          response.request().postDataJSON().symbol_id === "symbol-main",
        "older symbol focus",
      );
      releaseMain();
      await mainFocus;
      await waitForPackagedLocator(
        page.locator('.focused-source[data-view-id="view-client"]'),
        "completed race focus",
      );
    },
  );
});
