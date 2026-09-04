import { after, before, describe, it } from "node:test";
import { assertFileSearch, assertSymbolSearch } from "./packaged-browser-actions.js";
import { type PackagedBrowserFixture, startPackagedBrowserFixture } from "./packaged-browser-fixture.js";

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
});
