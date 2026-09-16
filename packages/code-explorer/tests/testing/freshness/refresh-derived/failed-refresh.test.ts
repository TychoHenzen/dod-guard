import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { it } from "node:test";
import { createRefreshServer } from "./create-refresh-server.js";
import { refreshRetainedDiscovery } from "./refresh-retained-discovery.js";
import { root } from "./root.js";

it(
  "retains the complete generation and reports " +
    "refresh_failed when a backend becomes unavailable",
  async () => {
    const directory = root();
    try {
      const server = createRefreshServer(
        directory,
        async () => {
          throw new Error("backend unavailable at C:/private");
        },
        () => "retained",
      );
      const { prior, status, later } = await refreshRetainedDiscovery(server);
      assert.equal("code" in prior, false);
      assert.equal("code" in status, false);
      assert.equal("code" in later, false);
      if ("code" in status || "code" in later)
        throw new Error("expected status result");
      assert.equal(status.state, "refresh_failed");
      assert.equal(status.project_generation, 1);
      assert.equal(JSON.stringify(status).includes("C:/private"), false);
      assert.deepEqual(
        (later.data.candidates as Array<{ name: string }>).map(
          (candidate) => candidate.name,
        ),
        ["retained"],
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
