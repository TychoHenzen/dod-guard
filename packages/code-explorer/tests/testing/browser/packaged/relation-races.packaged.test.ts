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
    "keeps the newest relation when " + "an older request finishes late",
    async () => {
      const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
      await page.goto("/");
      await page.getByRole("button", { name: "main", exact: true }).click();
      await page.locator('mark[data-handle="handle-main"]').click();
      const releaseDefinition = fixture.holdNextRelation("definition");
      await page
        .getByRole("button", { name: "definition", exact: true })
        .click();
      await page
        .getByRole("button", { name: "references", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Relations: references", exact: true })
        .waitFor();
      const definition = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/follow") &&
          response.request().postDataJSON().relation === "definition",
      );
      releaseDefinition();
      await definition;
      await page
        .getByRole("heading", { name: "Relations: references", exact: true })
        .waitFor();
    },
  );
  it("discards an old relation after focus changes", async () => {
    const page = await fixture.browser.newPage({ baseURL: fixture.endpoint });
    await page.goto("/");
    await page.getByRole("button", { name: "main", exact: true }).click();
    await page.locator('mark[data-handle="handle-main"]').click();
    const releaseDefinition = fixture.holdNextRelation("definition");
    await page.getByRole("button", { name: "definition", exact: true }).click();
    await page.locator('[data-operation="search"]').fill("client");
    await page.locator('[data-symbol-id="file:src/browser/client.ts"]').click();
    await page.locator('.focused-source[data-view-id="view-client"]').waitFor();
    const definition = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/follow") &&
        response.request().postDataJSON().relation === "definition",
    );
    releaseDefinition();
    await definition;
    const relations = page.locator('[data-pane="relations"]');
    await relations
      .getByRole("heading", { name: "Relations", exact: true })
      .waitFor();
    await relations.getByText("No relations loaded", { exact: true }).waitFor();
    if ((await relations.getAttribute("data-state")) !== "empty")
      throw new Error("expected empty relation state");
  });
});
