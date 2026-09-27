import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  type PackagedBrowserFixture,
  startPackagedBrowserFixture,
} from "../application-fixture.test.js";
import { waitForPackagedLocator } from "./test-timeouts.js";

let fixture: PackagedBrowserFixture;
const timeoutPrefix = /packaged_browser_timeout:forced timeout/;
const pageUrl = /page_url="http:\/\/127\.0\.0\.1:\d+\/"/;
const visibleStatus = /visible_status_text="[^"]+"/;
const fixtureServer =
  /fixture_server="listening=true; requests=\d+; last_request=/;
const fixtureProcess = /fixture_process="pid=\d+;/;
const fixtureBrowser = /browser_connected=true; pages=\d+; core_calls=\d+"/;

before(async () => {
  fixture = await startPackagedBrowserFixture();
});

after(async () => {
  await fixture.close();
});

describe("packaged browser timeout diagnostics", () => {
  it("reports bounded diagnostics when a locator times out", async () => {
    const page = await fixture.newPage();
    await page.goto("/");
    await assert.rejects(
      waitForPackagedLocator(
        page.locator('[data-forced-timeout="never"]'),
        "forced timeout",
        1,
      ),
      (error: unknown) => {
        assert.match(String(error), timeoutPrefix);
        assert.match(String(error), pageUrl);
        assert.match(String(error), visibleStatus);
        assert.match(String(error), fixtureServer);
        assert.match(String(error), fixtureProcess);
        assert.match(String(error), fixtureBrowser);
        return true;
      },
    );
  });
});
