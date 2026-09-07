import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startBrowserServer } from "../../../browser-server/lifecycle.js";
import { busyPort } from "./busy-port-fixture.js";
import { factory } from "./factory-fixture.js";

describe("browser server lifecycle", () => {
  it(
    "returns browser_port_unavailable without opening a " +
      "browser when all ports are occupied",
    async () => {
      let opens = 0;
      await assert.rejects(
        startBrowserServer({
          project_root: ".",
          no_open: false,
          coreFactory: factory([]),
          binder: { listen: busyPort },
          opener: {
            open: async () => {
              opens += 1;
            },
          },
        }),
        (error: unknown) =>
          (error as { code?: string }).code === "browser_port_unavailable",
      );
      assert.equal(opens, 0);
    },
  );
});
