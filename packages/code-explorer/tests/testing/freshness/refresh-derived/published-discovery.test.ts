import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { it } from "node:test";
import { createRefreshServer } from "./create-refresh-server.js";
import { refreshDiscovery } from "./refresh-discovery.js";
import { root } from "./root.js";

it(
  "atomically publishes replacement derived discovery after " +
    "backend refresh completes",
  async () => {
    let symbol = "before";
    const directory = root();
    try {
      const server = createRefreshServer(
        directory,
        async () => {
          symbol = "after";
        },
        () => symbol,
      );
      const { before, status, after } = await refreshDiscovery(server);
      assert.equal("code" in before, false);
      assert.equal("code" in status, false);
      assert.equal("code" in after, false);
      if ("code" in status || "code" in after)
        throw new Error("expected refresh result");
      assert.equal(status.state, "refreshed");
      assert.equal(status.project_generation, 2);
      assert.deepEqual(
        (after.data.candidates as Array<{ name: string }>).map(
          (candidate) => candidate.name,
        ),
        ["after"],
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
