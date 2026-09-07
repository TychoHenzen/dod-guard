import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nativePortBinder,
  startBrowserServer,
} from "../../../browser-server/lifecycle.js";
import { factory } from "./factory-fixture.js";
import { post } from "./post-fixture.js";

describe("browser server lifecycle", () => {
  it(
    "rejects a browser request that attempts to replace the " +
      "frozen project root",
    async () => {
      const listener = await nativePortBinder.listen(
        "127.0.0.1",
        4429,
        new AbortController().signal,
      );
      try {
        const response = await post(
          listener.address,
          JSON.stringify({ project_root: "another-project" }),
        );
        assert.equal(response.status, 400);
        assert.deepEqual(JSON.parse(response.body), {
          schema_version: 1,
          code: "invalid_request",
          message: "invalid_request",
          retryable: false,
        });
      } finally {
        await listener.close(AbortSignal.timeout(1000));
      }
    },
  );
  it(
    "fails before binding when the selected project root is " + "invalid",
    async () => {
      let bound = false;
      await assert.rejects(
        startBrowserServer({
          project_root: "missing-project-root",
          no_open: true,
          coreFactory: factory([]),
          binder: {
            listen: async () => {
              bound = true;
              throw new Error("unexpected");
            },
          },
          opener: { open: async () => undefined },
        }),
        (error: unknown) =>
          (error as { code?: string }).code === "invalid_project_root",
      );
      assert.equal(bound, false);
    },
  );
});
