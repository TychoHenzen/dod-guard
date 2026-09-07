import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "../../../index.js";

it("does not allocate a ninth live session", async () => {
  const server = createServer();
  for (let index = 0; index < 8; index += 1) {
    const result = await server.call("code_status", {
      action: "start_session",
    });
    assert.equal("code" in result, false);
  }
  const result = await server.call("code_status", { action: "start_session" });
  assert.deepEqual(result, {
    schema_version: 1,
    code: "project_capacity",
    message: "project_capacity",
    retryable: true,
  });
});
