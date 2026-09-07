import assert from "node:assert/strict";
import { it } from "node:test";
import { packagedReply } from "./core-replies.test.js";

it("rejects inherited keys in packaged fixture requests", () => {
  const rejected = {
    schema_version: 1,
    code: "invalid_request",
    message: "invalid_request",
    retryable: false,
  };
  assert.deepEqual(packagedReply("toString", {}), rejected);
  assert.deepEqual(packagedReply("__proto__", {}), rejected);
  assert.deepEqual(
    packagedReply("code_focus", { symbol_id: "constructor" }),
    rejected,
  );
});
