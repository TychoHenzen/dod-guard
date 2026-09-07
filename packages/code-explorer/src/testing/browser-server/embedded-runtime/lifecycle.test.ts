import assert from "node:assert/strict";
import { it } from "node:test";
import * as embedded from "../../../browser-server/embedded-runtime.js";
import { runtimeCore } from "./core-fixture.js";

it("rejects non-loopback origins before starting the core", async () => {
  await assert.rejects(
    embedded.startEmbeddedBrowserRuntime({
      projectRoot: ".",
      origin: "http://example.com:4400",
      assetRoot: ".",
      coreFactory: { start: unexpectedCoreStart },
    }),
    { code: "invalid_request" },
  );
});

it(
  "shares one close operation across repeated " + "shutdown requests",
  async () => {
    let closes = 0;
    const runtime = await embedded.startEmbeddedBrowserRuntime({
      projectRoot: ".",
      origin: "http://127.0.0.1:4400",
      assetRoot: ".",
      coreFactory: runtimeCore([], () => {
        closes += 1;
      }),
    });
    const first = runtime.close();
    try {
      assert.equal(runtime.close(), first);
      await first;
      assert.equal(closes, 1);
    } finally {
      await runtime.close();
    }
  },
);

async function unexpectedCoreStart(): Promise<never> {
  throw new Error("unexpected_core_start");
}
