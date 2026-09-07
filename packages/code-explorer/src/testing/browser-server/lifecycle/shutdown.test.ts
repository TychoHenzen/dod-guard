import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startBrowserServer } from "../../../browser-server/lifecycle.js";
import { fakeListener } from "./fake-listener-fixture.js";
import { shutdownCore } from "./shutdown-core-fixture.js";

describe("browser server lifecycle", () => {
  it(
    "stops admission and aborts the shared " + "core during shutdown",
    async () => {
      const stopped: number[] = [];
      let coreAborted = false;
      const service = await startBrowserServer({
        project_root: ".",
        no_open: true,
        coreFactory: shutdownCore((signal) => {
          coreAborted = signal.aborted;
        }),
        binder: { listen: async (_host, port) => fakeListener(port, stopped) },
        opener: { open: async () => undefined },
      });
      await service.close();
      assert.equal(coreAborted, true);
      assert.deepEqual(stopped, [4410]);
    },
  );
});
