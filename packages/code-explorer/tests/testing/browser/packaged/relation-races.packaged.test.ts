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
    "keeps the newest relation when " + "an older request finishes late",
    async () => {
      const page = await fixture.newPage();
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
      await waitForPackagedLocator(
        page.getByRole("heading", {
          name: "Relations: references",
          exact: true,
        }),
        "newest relation",
      );
      const definition = waitForPackagedResponse(
        page,
        (response) =>
          response.url().endsWith("/api/follow") &&
          response.request().postDataJSON().relation === "definition",
        "older relation",
      );
      releaseDefinition();
      await definition;
      await waitForPackagedLocator(
        page.getByRole("heading", {
          name: "Relations: references",
          exact: true,
        }),
        "completed relation",
      );
    },
  );
  it("discards an old relation after focus changes", async () => {
    const page = await fixture.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "main", exact: true }).click();
    await page.locator('mark[data-handle="handle-main"]').click();
    const releaseDefinition = fixture.holdNextRelation("definition");
    await page.getByRole("button", { name: "definition", exact: true }).click();
    await page.locator('[data-operation="search"]').fill("client");
    await page.locator('[data-symbol-id="file:src/browser/client.ts"]').click();
    await waitForPackagedLocator(
      page.locator('.focused-source[data-view-id="view-client"]'),
      "focus after stale relation",
    );
    const definition = waitForPackagedResponse(
      page,
      (response) =>
        response.url().endsWith("/api/follow") &&
        response.request().postDataJSON().relation === "definition",
      "stale relation",
    );
    releaseDefinition();
    await definition;
    const relations = page.locator('[data-pane="relations"]');
    await waitForPackagedLocator(
      relations.getByRole("heading", { name: "Relations", exact: true }),
      "relation reset",
    );
    await waitForPackagedLocator(
      relations.getByText("No relations loaded", { exact: true }),
      "empty relation state",
    );
    if ((await relations.getAttribute("data-state")) !== "empty")
      throw new Error("expected empty relation state");
  });
});
