import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";

it(
  "reports active generated exclusions while leaving the " +
    "exclusion path out of normal navigation",
  async () => {
    const server = createServer({
      workspace_status: () => ({
        active_exclusions: ["dist/**"],
        excluded_path_count: 1,
      }),
    });
    const response = await server.call("code_status", { action: "status" });
    assert.equal("code" in response, false);
    if ("code" in response) throw new Error("expected status");
    assert.deepEqual(response.data.active_exclusions, ["dist/**"]);
    assert.equal(response.data.excluded_path_count, 1);
  },
);
